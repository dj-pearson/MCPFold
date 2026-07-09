import {
  findMcpRemoteArg,
  MCP_REMOTE_SPEC,
  serialize,
  type ClientId,
  type Config,
  type ResolvedServer,
  type ServerConfig,
} from '@mcpfold/core';
import type {
  ClientAdapter,
  OsContext,
  RemoteCapability,
  RenderedFile,
  SecretStrategy,
} from './types.js';
import { realOsContext } from './paths.js';

/**
 * The `mcp-remote` bridge decision (S17.2). A remote server must be shimmed to a pinned
 * `npx mcp-remote` stdio launch when the target client either can't reach remotes at all
 * (`!nativeHttp`, e.g. Claude Desktop's stdio-only config) or can't attach auth to a native
 * remote entry (`authed && !nativeOauth`, e.g. Windsurf). Everything else folds natively.
 */
export function remoteNeedsShim(capability: RemoteCapability, server: ResolvedServer): boolean {
  const isRemote = server.transport === 'streamable-http' || server.transport === 'sse';
  if (!isRemote) return false;
  // `oauth` (S17.5) is client-native — the client runs the OAuth flow itself, so it never needs the
  // bridge. Only static credentials (bearer/header) that a client can't attach natively force a shim.
  const hasStaticAuth = server.auth?.type === 'bearer' || server.auth?.type === 'header';
  return !capability.nativeHttp || (hasStaticAuth && !capability.nativeOauth);
}

/** `--header` args carrying each of a server's auth values (refs pass through; resolved at S4.6). */
function shimHeaderArgs(server: ResolvedServer): string[] {
  const args: string[] = [];
  if (server.auth?.type === 'bearer' && server.auth.token) {
    args.push('--header', `Authorization: Bearer ${server.auth.token}`);
  }
  for (const [name, value] of Object.entries(server.auth?.headers ?? {})) {
    args.push('--header', `${name}: ${value}`);
  }
  return args;
}

/** Render a remote server as a pinned `npx mcp-remote` stdio entry (the shim). */
export function renderRemoteShim(server: ResolvedServer): McpStdioEntry {
  return {
    command: 'npx',
    args: ['-y', MCP_REMOTE_SPEC, server.url ?? '', ...shimHeaderArgs(server)],
  };
}

/**
 * Reverse an `mcp-remote` shim entry back to a canonical http server, or `null` if the entry
 * isn't a shim. Recognizes both the pinned spec and legacy unpinned `mcp-remote`.
 */
export function parseRemoteShim(entry: Record<string, unknown>): ServerConfig | null {
  if (entry.command !== 'npx') return null;
  const args = Array.isArray(entry.args) ? (entry.args as string[]) : [];
  const idx = findMcpRemoteArg(args)?.index ?? -1;
  if (idx === -1) return null;
  const url = args[idx + 1] ?? '';
  const headers: Record<string, string> = {};
  for (let i = idx + 2; i < args.length - 1; i++) {
    if (args[i] === '--header') {
      const raw = args[i + 1] ?? '';
      const sep = raw.indexOf(':');
      if (sep !== -1) headers[raw.slice(0, sep).trim()] = raw.slice(sep + 1).trim();
    }
  }
  const server: ServerConfig = { transport: 'streamable-http', url, tags: [] };
  if (Object.keys(headers).length > 0) server.auth = { type: 'header', headers };
  return server;
}

/**
 * Shared helpers for the many clients that use the `mcpServers`-style shape (Cursor,
 * Claude Desktop, Claude Code, and — with a different root key — Zed). Each native entry
 * is either a stdio launch (`command`/`args`/`env`) or a remote endpoint (`url`/`headers`).
 *
 * NOTE: secret injection (bearer token → Authorization header, or the shim launcher) is
 * layered on at S4.6. At S2.1 render is purely structural: `auth.headers` (which may hold
 * refs) pass through; the bearer `auth.token` is intentionally NOT written here.
 */

export interface McpStdioEntry {
  type?: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpRemoteEntry {
  type?: 'http' | 'sse';
  url: string;
  headers?: Record<string, string>;
}

export type McpServerEntry = McpStdioEntry | McpRemoteEntry;

export interface ToEntryOptions {
  /** Emit an explicit `type` field (Claude Code does; others infer from command/url). */
  includeType?: boolean;
  /** Remote capability (S17.2); when set, a remote server that needs the shim is bridged. */
  remote?: RemoteCapability;
}

/** Map one resolved server to its native `mcpServers`-style entry (or a shim, per capability). */
export function toMcpEntry(server: ResolvedServer, options: ToEntryOptions = {}): McpServerEntry {
  // S17.2: a remote server the client can't fold natively becomes a pinned mcp-remote stdio launch.
  if (options.remote && remoteNeedsShim(options.remote, server)) {
    return renderRemoteShim(server);
  }
  if (server.transport === 'stdio') {
    const entry: McpStdioEntry = { command: server.command ?? '' };
    if (options.includeType) entry.type = 'stdio';
    if (server.args) entry.args = server.args;
    if (server.env) entry.env = server.env;
    return entry;
  }
  const entry: McpRemoteEntry = { url: server.url ?? '' };
  if (options.includeType) entry.type = server.transport === 'sse' ? 'sse' : 'http';
  if (server.auth?.headers) entry.headers = server.auth.headers;
  return entry;
}

/**
 * A server normalized to the launch/endpoint parts a bespoke (non-`mcpServers`) adapter needs —
 * YAML/TOML clients (S19.2). The `mcp-remote` shim decision is applied here just like {@link
 * toMcpEntry}, so a remote server a client can't fold natively becomes a stdio `npx mcp-remote`
 * launch expressed in the client's own field names.
 */
export interface NormalizedEntry {
  kind: 'stdio' | 'remote';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  /** True when the remote endpoint is SSE (vs streamable HTTP). */
  sse?: boolean;
}

/** Normalize a resolved server for a bespoke adapter, applying the `mcp-remote` shim per capability. */
export function normalizeServer(
  server: ResolvedServer,
  capability: RemoteCapability,
): NormalizedEntry {
  if (remoteNeedsShim(capability, server)) {
    const shim = renderRemoteShim(server);
    return { kind: 'stdio', command: shim.command, args: shim.args };
  }
  if (server.transport === 'stdio') {
    return { kind: 'stdio', command: server.command ?? '', args: server.args, env: server.env };
  }
  return {
    kind: 'remote',
    url: server.url ?? '',
    headers: server.auth?.headers,
    sse: server.transport === 'sse',
  };
}

/** Build the `{ [name]: entry }` map from resolved servers. */
export function toMcpServersShape(
  servers: ResolvedServer[],
  options: ToEntryOptions = {},
): Record<string, McpServerEntry> {
  const out: Record<string, McpServerEntry> = {};
  for (const server of servers) out[server.name] = toMcpEntry(server, options);
  return out;
}

/**
 * Parse an `mcpServers`-style object back to a canonical partial (powers `import` + drift).
 * Transport is inferred: `command` → stdio, `url` → http (or the explicit `type`).
 */
export function fromMcpServersShape(raw: unknown): Partial<Config> {
  const servers: Record<string, ServerConfig> = {};
  if (raw && typeof raw === 'object') {
    for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const entry = value as Record<string, unknown>;
      // S17.2: reverse an mcp-remote shim back to the canonical http server it stands in for.
      const unshimmed = parseRemoteShim(entry);
      if (unshimmed) {
        servers[name] = unshimmed;
        continue;
      }
      if (typeof entry.command === 'string') {
        const server: ServerConfig = { transport: 'stdio', command: entry.command, tags: [] };
        if (Array.isArray(entry.args)) server.args = entry.args as string[];
        if (entry.env && typeof entry.env === 'object') {
          server.env = entry.env as Record<string, string>;
        }
        servers[name] = server;
      } else if (typeof entry.url === 'string') {
        // Canonical remote transport is `streamable-http` (S17.5); only an explicit `sse` is sse.
        const explicitType = entry.type === 'sse' ? 'sse' : 'streamable-http';
        const server: ServerConfig = { transport: explicitType, url: entry.url, tags: [] };
        if (entry.headers && typeof entry.headers === 'object') {
          server.auth = { type: 'header', headers: entry.headers as Record<string, string> };
        }
        servers[name] = server;
      }
    }
  }
  return { servers };
}

export interface McpServersAdapterConfig {
  id: ClientId;
  /** Native root key. Default `mcpServers`; VS Code uses `servers`, Zed `context_servers`. */
  rootKey?: string;
  secretStrategy?: SecretStrategy;
  needsRestart?: boolean;
  /** Emit an explicit per-server `type` field (Claude Code). */
  includeType?: boolean;
  /** Remote-transport capability (S17.2) — drives native-entry vs `mcp-remote` shim folding. */
  remote: RemoteCapability;
  /** Client-specific path resolution. */
  resolvePath: (
    scope: Parameters<ClientAdapter['resolvePath']>[0],
    projectPath?: string,
    ctx?: OsContext,
  ) => string;
}

/**
 * Build a {@link ClientAdapter} for an `mcpServers`-style client. Reused by Cursor,
 * Claude Desktop, and Claude Code — each supplies only its path resolution and quirks. Remote
 * servers fold natively or via the pinned `mcp-remote` shim per the declared `remote` capability.
 */
export function createMcpServersAdapter(config: McpServersAdapterConfig): ClientAdapter {
  const rootKey = config.rootKey ?? 'mcpServers';
  const secretStrategy = config.secretStrategy ?? 'shim';
  const needsRestart = config.needsRestart ?? false;

  return {
    id: config.id,
    secretStrategy,
    needsRestart,
    remote: config.remote,
    resolvePath: config.resolvePath,
    // `mcpServers`-style clients own a dedicated JSON file, so `existing` is ignored (full rewrite).
    render(servers, ctx = realOsContext(), _existing?: string): RenderedFile {
      const shape = toMcpServersShape(servers, {
        includeType: config.includeType,
        remote: config.remote,
      });
      const scope = servers[0]?.scope ?? 'user';
      const projectPath = servers[0]?.projectPath;
      return {
        path: config.resolvePath(scope, projectPath, ctx),
        contents: serialize({ [rootKey]: shape }),
        needsRestart,
      };
    },
    parse(contents): Partial<Config> {
      const raw = JSON.parse(contents) as Record<string, unknown>;
      return fromMcpServersShape(raw[rootKey]);
    },
  };
}
