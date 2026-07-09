import { serialize, type Config, type ResolvedServer, type ServerConfig } from '@mcpfold/core';
import { joinFor, realOsContext } from './paths.js';
import type { ClientAdapter, OsContext, RenderedFile } from './types.js';

/**
 * Gemini CLI adapter (S14.1, corrected S17.3). The Gemini CLI reads MCP servers from the
 * `mcpServers` root of `~/.gemini/settings.json` and picks them up on the next run (no restart).
 * User scope only.
 *
 * Unlike the generic `mcpServers` clients, Gemini distinguishes the two remote transports by KEY,
 * not a `type` field (per current docs): **`httpUrl`** for streamable HTTP, **`url`** for SSE.
 * stdio uses `command`/`args`/`env`. We therefore render/parse these keys explicitly rather than
 * reusing the shared shape (which emits `url` for both).
 */

interface GeminiStdioEntry {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}
interface GeminiHttpEntry {
  httpUrl: string;
  headers?: Record<string, string>;
}
interface GeminiSseEntry {
  url: string;
  headers?: Record<string, string>;
}
type GeminiEntry = GeminiStdioEntry | GeminiHttpEntry | GeminiSseEntry;

function toGeminiEntry(server: ResolvedServer): GeminiEntry {
  if (server.transport === 'stdio') {
    const entry: GeminiStdioEntry = { command: server.command ?? '' };
    if (server.args) entry.args = server.args;
    if (server.env) entry.env = server.env;
    return entry;
  }
  if (server.transport === 'sse') {
    const entry: GeminiSseEntry = { url: server.url ?? '' };
    if (server.auth?.headers) entry.headers = server.auth.headers;
    return entry;
  }
  // streamable HTTP → `httpUrl`
  const entry: GeminiHttpEntry = { httpUrl: server.url ?? '' };
  if (server.auth?.headers) entry.headers = server.auth.headers;
  return entry;
}

export const geminiCliAdapter: ClientAdapter = {
  id: 'gemini-cli',
  secretStrategy: 'shim',
  needsRestart: false,
  // Native remotes with header auth; streamable HTTP under `httpUrl`, SSE under `url`.
  remote: { nativeHttp: true, nativeOauth: true, fieldShape: 'httpUrl' },

  resolvePath(scope, _projectPath, ctx: OsContext = realOsContext()) {
    if (scope !== 'user') throw new Error('Gemini CLI only supports user scope.');
    return joinFor(ctx, ctx.home, '.gemini', 'settings.json');
  },

  render(servers, ctx: OsContext = realOsContext()): RenderedFile {
    const mcpServers: Record<string, GeminiEntry> = {};
    for (const server of servers) mcpServers[server.name] = toGeminiEntry(server);
    return {
      path: this.resolvePath('user', undefined, ctx),
      contents: serialize({ mcpServers }),
      needsRestart: false,
    };
  },

  parse(contents): Partial<Config> {
    const raw = JSON.parse(contents) as { mcpServers?: Record<string, unknown> };
    const servers: Record<string, ServerConfig> = {};
    for (const [name, value] of Object.entries(raw.mcpServers ?? {})) {
      if (!value || typeof value !== 'object') continue;
      const entry = value as Record<string, unknown>;
      if (typeof entry.command === 'string') {
        const server: ServerConfig = { transport: 'stdio', command: entry.command, tags: [] };
        if (Array.isArray(entry.args)) server.args = entry.args as string[];
        if (entry.env && typeof entry.env === 'object') {
          server.env = entry.env as Record<string, string>;
        }
        servers[name] = server;
      } else if (typeof entry.httpUrl === 'string') {
        const server: ServerConfig = { transport: 'http', url: entry.httpUrl, tags: [] };
        if (entry.headers && typeof entry.headers === 'object') {
          server.auth = { type: 'header', headers: entry.headers as Record<string, string> };
        }
        servers[name] = server;
      } else if (typeof entry.url === 'string') {
        const server: ServerConfig = { transport: 'sse', url: entry.url, tags: [] };
        if (entry.headers && typeof entry.headers === 'object') {
          server.auth = { type: 'header', headers: entry.headers as Record<string, string> };
        }
        servers[name] = server;
      }
    }
    return { servers };
  },
};
