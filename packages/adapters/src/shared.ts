import {
  serialize,
  type ClientId,
  type Config,
  type ResolvedServer,
  type ServerConfig,
} from '@mcpfold/core';
import type { ClientAdapter, OsContext, RenderedFile, SecretStrategy } from './types.js';
import { realOsContext } from './paths.js';

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
}

/** Map one resolved server to its native `mcpServers`-style entry. */
export function toMcpEntry(server: ResolvedServer, options: ToEntryOptions = {}): McpServerEntry {
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
      if (typeof entry.command === 'string') {
        const server: ServerConfig = { transport: 'stdio', command: entry.command, tags: [] };
        if (Array.isArray(entry.args)) server.args = entry.args as string[];
        if (entry.env && typeof entry.env === 'object') {
          server.env = entry.env as Record<string, string>;
        }
        servers[name] = server;
      } else if (typeof entry.url === 'string') {
        const explicitType = entry.type === 'sse' ? 'sse' : 'http';
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
  /** Client-specific path resolution. */
  resolvePath: (
    scope: Parameters<ClientAdapter['resolvePath']>[0],
    projectPath?: string,
    ctx?: OsContext,
  ) => string;
}

/**
 * Build a {@link ClientAdapter} for an `mcpServers`-style client. Reused by Cursor,
 * Claude Desktop, and Claude Code — each supplies only its path resolution and quirks.
 */
export function createMcpServersAdapter(config: McpServersAdapterConfig): ClientAdapter {
  const rootKey = config.rootKey ?? 'mcpServers';
  const secretStrategy = config.secretStrategy ?? 'shim';
  const needsRestart = config.needsRestart ?? false;

  return {
    id: config.id,
    secretStrategy,
    needsRestart,
    resolvePath: config.resolvePath,
    render(servers, ctx = realOsContext()): RenderedFile {
      const shape = toMcpServersShape(servers, { includeType: config.includeType });
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
