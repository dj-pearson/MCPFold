import type { Config, ResolvedServer, ServerConfig } from '@mcpfold/core';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import { joinFor, realOsContext } from './paths.js';
import { normalizeServer } from './shared.js';
import type { ClientAdapter, OsContext, RenderedFile } from './types.js';

/**
 * Codex CLI adapter (S19.2) — bespoke TOML. OpenAI's Codex CLI keeps MCP servers under
 * `[mcp_servers.<name>]` tables (snake_case — NOT `mcpServers`) in `~/.codex/config.toml`, a SHARED
 * file that also holds `model`, `sandbox_mode`, `tui.*`, etc. Writing MUST preserve every unmanaged
 * table/key (TOML comments are not preserved by the parser — key preservation only, which the AC
 * allows "where feasible"). Verified July 2026 against developers.openai.com/codex/config-reference
 * + /codex/mcp. `CODEX_HOME` overrides the base dir.
 *
 * Path: ~/.codex/config.toml (all platforms; %USERPROFILE%\.codex\config.toml on Windows).
 */

const remote = { nativeHttp: true, nativeOauth: true, fieldShape: 'url' as const };

interface CodexEntry {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  http_headers?: Record<string, string>;
}

function toMcpServers(servers: ResolvedServer[]): Record<string, CodexEntry> {
  const out: Record<string, CodexEntry> = {};
  for (const server of servers) {
    const n = normalizeServer(server, remote);
    if (n.kind === 'stdio') {
      const e: CodexEntry = { command: n.command ?? '' };
      if (n.args) e.args = n.args;
      if (n.env && Object.keys(n.env).length > 0) e.env = n.env;
      out[server.name] = e;
    } else {
      const e: CodexEntry = { url: n.url ?? '' };
      if (n.headers && Object.keys(n.headers).length > 0) e.http_headers = n.headers;
      out[server.name] = e;
    }
  }
  return out;
}

export const codexCliAdapter: ClientAdapter = {
  id: 'codex-cli',
  secretStrategy: 'shim',
  needsRestart: false,
  remote,
  resolvePath(scope, _projectPath, ctx: OsContext = realOsContext()) {
    if (scope !== 'user') throw new Error('Codex CLI adapter supports user scope.');
    const base = ctx.env.CODEX_HOME ?? joinFor(ctx, ctx.home, '.codex');
    return joinFor(ctx, base, 'config.toml');
  },
  render(servers, ctx = realOsContext(), existing?: string): RenderedFile {
    const mcp_servers = toMcpServers(servers);
    let contents: string;
    if (existing && existing.trim()) {
      // Preserve every unmanaged table/key; replace only `mcp_servers`.
      const doc = (parseToml(existing) ?? {}) as Record<string, unknown>;
      doc.mcp_servers = mcp_servers;
      contents = `${stringifyToml(doc)}\n`;
    } else {
      contents = `${stringifyToml({ mcp_servers })}\n`;
    }
    const scope = servers[0]?.scope ?? 'user';
    return {
      path: this.resolvePath(scope, servers[0]?.projectPath, ctx),
      contents,
      needsRestart: false,
    };
  },
  parse(contents): Partial<Config> {
    const raw = (parseToml(contents) ?? {}) as { mcp_servers?: Record<string, unknown> };
    const servers: Record<string, ServerConfig> = {};
    for (const [name, value] of Object.entries(raw.mcp_servers ?? {})) {
      if (!value || typeof value !== 'object') continue;
      const e = value as Record<string, unknown>;
      if (typeof e.command === 'string') {
        const s: ServerConfig = { transport: 'stdio', command: e.command, tags: [] };
        if (Array.isArray(e.args)) s.args = e.args as string[];
        if (e.env && typeof e.env === 'object' && Object.keys(e.env).length > 0) {
          s.env = e.env as Record<string, string>;
        }
        servers[name] = s;
      } else if (typeof e.url === 'string') {
        const s: ServerConfig = { transport: 'streamable-http', url: e.url, tags: [] };
        const headers = (e.http_headers ?? e.headers) as Record<string, string> | undefined;
        if (headers && typeof headers === 'object') s.auth = { type: 'header', headers };
        servers[name] = s;
      }
    }
    return { servers };
  },
};
