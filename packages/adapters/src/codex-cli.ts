import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import type { Config, ResolvedServer, ServerConfig } from '@mcpfold/core';
import { joinFor, realOsContext } from './paths.js';
import type { ClientAdapter, OsContext, RenderedFile } from './types.js';

/**
 * OpenAI Codex CLI adapter (S19.2). Codex reads MCP servers from `[mcp_servers.<name>]` tables in
 * a shared `config.toml` that also holds model/approval/sandbox settings, so mcpfold **merges**
 * into it, preserving every other table. Verified against the hosted Codex config-reference
 * (learn.chatgpt.com, canonical `developers.openai.com/codex/config-reference`), July 2026.
 *
 * Format quirks encoded here:
 *   - Each server is a `[mcp_servers.<name>]` table with `command` / `args` / `env` (stdio) or
 *     `url` / `http_headers` (remote streamable-HTTP; Codex authenticates via `bearer_token_env_var`
 *     or `auth`, which the shim strategy handles, so only literal `http_headers` are rendered).
 *   - TOML has no comment-preserving serializer available, so **unmanaged tables/keys are preserved
 *     (as data) but comments are not** — the honest limit of "preserve … where feasible".
 *
 * Path (honors `CODEX_HOME`, which replaces the whole `~/.codex` dir):
 *   - default:  `~/.codex/config.toml`  (`%USERPROFILE%\.codex\config.toml` on win)
 *   - override: `$CODEX_HOME/config.toml`
 *
 * Secret strategy `shim`; no restart.
 */

interface CodexStdioEntry {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}
interface CodexRemoteEntry {
  url: string;
  http_headers?: Record<string, string>;
}
type CodexEntry = CodexStdioEntry | CodexRemoteEntry;

function toCodexEntry(server: ResolvedServer): CodexEntry {
  if (server.transport === 'stdio') {
    const entry: CodexStdioEntry = { command: server.command ?? '' };
    if (server.args) entry.args = server.args;
    if (server.env) entry.env = server.env;
    return entry;
  }
  const entry: CodexRemoteEntry = { url: server.url ?? '' };
  if (server.auth?.headers) entry.http_headers = server.auth.headers;
  return entry;
}

export const codexCliAdapter: ClientAdapter = {
  id: 'codex-cli',
  secretStrategy: 'shim',
  needsRestart: false,
  // Codex calls streamable-http remotes natively; auth via bearer_token_env_var / oauth.
  remote: { nativeHttp: true, nativeOauth: true, fieldShape: 'url' },

  resolvePath(scope, _projectPath, ctx: OsContext = realOsContext()) {
    if (scope !== 'user') throw new Error('Codex CLI only supports user scope.');
    const codexHome = ctx.env.CODEX_HOME ?? joinFor(ctx, ctx.home, '.codex');
    return joinFor(ctx, codexHome, 'config.toml');
  },

  render(servers, ctx: OsContext = realOsContext(), existing?: string): RenderedFile {
    // Preserve every non-MCP table by round-tripping the existing doc and replacing only the
    // `mcp_servers` table with the canonical set (mcpfold owns the server list).
    const root: Record<string, unknown> =
      existing && existing.trim().length > 0
        ? (parseToml(existing) as Record<string, unknown>)
        : {};
    const mcpServers = Object.create(null) as Record<string, CodexEntry>;
    for (const server of [...servers].sort((a, b) => a.name.localeCompare(b.name))) {
      mcpServers[server.name] = toCodexEntry(server);
    }
    root.mcp_servers = mcpServers;

    const scope = servers[0]?.scope ?? 'user';
    const projectPath = servers[0]?.projectPath;
    const body = stringifyToml(root);
    return {
      path: this.resolvePath(scope, projectPath, ctx),
      contents: body.endsWith('\n') ? body : `${body}\n`,
      needsRestart: false,
    };
  },

  parse(contents): Partial<Config> {
    const root = (parseToml(contents) ?? {}) as { mcp_servers?: Record<string, unknown> };
    const servers = Object.create(null) as Record<string, ServerConfig>;
    for (const [name, value] of Object.entries(root.mcp_servers ?? {})) {
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
        const server: ServerConfig = { transport: 'streamable-http', url: entry.url, tags: [] };
        const headers = entry.http_headers;
        if (headers && typeof headers === 'object') {
          server.auth = { type: 'header', headers: headers as Record<string, string> };
        }
        servers[name] = server;
      }
    }
    return { servers };
  },
};
