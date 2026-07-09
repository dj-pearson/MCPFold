import {
  findMcpRemoteArg,
  MCP_REMOTE_SPEC,
  serialize,
  type Config,
  type ResolvedServer,
  type ServerConfig,
} from '@mcpfold/core';
import { joinFor, realOsContext } from './paths.js';
import type { ClientAdapter, OsContext, RenderedFile } from './types.js';

/**
 * Windsurf adapter (S2.6). Windsurf uses the `mcpServers` root but **cannot natively call
 * authenticated remote servers**, so an http/sse server that carries auth is rewritten to
 * a stdio `mcp-remote` invocation:
 *
 *   { "command": "npx", "args": ["-y", "mcp-remote", "<url>", "--header", "Name: Value", ...] }
 *
 * Plain stdio and unauthenticated remote servers render normally. Restart required
 * (needsRestart=true). `parse` recognizes the `mcp-remote` wrapper and reverses it to a
 * canonical http server on import. (Secret VALUES are injected later at S4.6; header refs
 * pass through here.)
 */

interface WindsurfStdioEntry {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}
interface WindsurfRemoteEntry {
  url: string;
  headers?: Record<string, string>;
}
type WindsurfEntry = WindsurfStdioEntry | WindsurfRemoteEntry;

function needsRemoteWrapper(server: ResolvedServer): boolean {
  const isRemote = server.transport === 'http' || server.transport === 'sse';
  const hasAuth = Boolean(server.auth && server.auth.type !== 'none');
  return isRemote && hasAuth;
}

function headerArgs(server: ResolvedServer): string[] {
  const args: string[] = [];
  if (server.auth?.type === 'bearer' && server.auth.token) {
    args.push('--header', `Authorization: Bearer ${server.auth.token}`);
  }
  for (const [name, value] of Object.entries(server.auth?.headers ?? {})) {
    args.push('--header', `${name}: ${value}`);
  }
  return args;
}

function toWindsurfEntry(server: ResolvedServer): WindsurfEntry {
  if (needsRemoteWrapper(server)) {
    return {
      command: 'npx',
      args: ['-y', MCP_REMOTE_SPEC, server.url ?? '', ...headerArgs(server)],
    };
  }
  if (server.transport === 'stdio') {
    const entry: WindsurfStdioEntry = { command: server.command ?? '' };
    if (server.args) entry.args = server.args;
    if (server.env) entry.env = server.env;
    return entry;
  }
  const entry: WindsurfRemoteEntry = { url: server.url ?? '' };
  if (server.auth?.headers) entry.headers = server.auth.headers;
  return entry;
}

export const windsurfAdapter: ClientAdapter = {
  id: 'windsurf',
  secretStrategy: 'shim',
  needsRestart: true,

  resolvePath(_scope, _projectPath, ctx: OsContext = realOsContext()) {
    // Windsurf keeps MCP config under ~/.codeium/windsurf/mcp_config.json on every OS.
    return joinFor(ctx, ctx.home, '.codeium', 'windsurf', 'mcp_config.json');
  },

  render(servers, ctx: OsContext = realOsContext()): RenderedFile {
    const mcpServers: Record<string, WindsurfEntry> = {};
    for (const server of servers) mcpServers[server.name] = toWindsurfEntry(server);
    return {
      path: this.resolvePath('user', undefined, ctx),
      contents: serialize({ mcpServers }),
      needsRestart: true,
    };
  },

  parse(contents): Partial<Config> {
    const raw = JSON.parse(contents) as { mcpServers?: Record<string, unknown> };
    const servers: Record<string, ServerConfig> = {};
    for (const [name, value] of Object.entries(raw.mcpServers ?? {})) {
      if (!value || typeof value !== 'object') continue;
      const entry = value as Record<string, unknown>;
      const args = Array.isArray(entry.args) ? (entry.args as string[]) : [];
      // Recognize both the pinned spec (`mcp-remote@x.y.z`) and legacy unpinned (`mcp-remote`).
      const remoteIdx = findMcpRemoteArg(args)?.index ?? -1;

      if (entry.command === 'npx' && remoteIdx !== -1) {
        // Reverse the mcp-remote wrapper back to a canonical http server.
        const url = args[remoteIdx + 1] ?? '';
        const headers: Record<string, string> = {};
        for (let i = remoteIdx + 2; i < args.length - 1; i++) {
          if (args[i] === '--header') {
            const raw2 = args[i + 1] ?? '';
            const sep = raw2.indexOf(':');
            if (sep !== -1) headers[raw2.slice(0, sep).trim()] = raw2.slice(sep + 1).trim();
          }
        }
        const server: ServerConfig = { transport: 'http', url, tags: [] };
        if (Object.keys(headers).length > 0) server.auth = { type: 'header', headers };
        servers[name] = server;
      } else if (typeof entry.command === 'string') {
        const server: ServerConfig = { transport: 'stdio', command: entry.command, tags: [] };
        if (args.length > 0) server.args = args;
        if (entry.env && typeof entry.env === 'object')
          server.env = entry.env as Record<string, string>;
        servers[name] = server;
      } else if (typeof entry.url === 'string') {
        servers[name] = { transport: 'http', url: entry.url, tags: [] };
      }
    }
    return { servers };
  },
};
