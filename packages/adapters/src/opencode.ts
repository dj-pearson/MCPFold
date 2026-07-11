import { applyEdits, modify } from 'jsonc-parser';
import type { Config, ResolvedServer, ServerConfig } from '@mcpfold/core';
import { envRefCanonicalizer, parseClientJsonc } from './shared.js';
import { expandHome, joinFor, realOsContext } from './paths.js';
import type { ClientAdapter, OsContext, RenderedFile } from './types.js';

/**
 * opencode adapter (S19.2) — the SST terminal agent (opencode.ai / sst/opencode). MCP servers live
 * under the **`mcp`** key of a shared `opencode.json(c)` that also holds model/provider/theme/etc.,
 * so mcpfold **merges** into it with jsonc-parser's structural edit — preserving every other
 * top-level key **and comments**. Verified against opencode.ai/docs (config + mcp-servers), July
 * 2026.
 *
 * Format quirks encoded here:
 *   - Root key `mcp` (a map keyed by name), NOT `mcpServers`.
 *   - Local entries use `type: "local"` with **`command` as an ARRAY** (`[exe, ...args]`) and
 *     **`environment`** (not `env`); remote entries use `type: "remote"` with `url` + `headers`.
 *     Every entry carries `enabled: true`.
 *
 * Paths (opencode uses XDG even on Windows — `%USERPROFILE%\.config\opencode` — honoring
 * `XDG_CONFIG_HOME`):
 *   - user (global):  `~/.config/opencode/opencode.json`
 *   - project:        `<projectPath>/opencode.json`
 *
 * Secret strategy `shim` (opencode has variable substitution; folding refs into it is S19.4). No
 * restart.
 */

interface OpencodeLocalEntry {
  type: 'local';
  command: string[];
  environment?: Record<string, string>;
  enabled: true;
}
interface OpencodeRemoteEntry {
  type: 'remote';
  url: string;
  headers?: Record<string, string>;
  enabled: true;
}
type OpencodeEntry = OpencodeLocalEntry | OpencodeRemoteEntry;

function toOpencodeEntry(server: ResolvedServer): OpencodeEntry {
  if (server.transport === 'stdio') {
    const entry: OpencodeLocalEntry = {
      type: 'local',
      command: [server.command ?? '', ...(server.args ?? [])],
      enabled: true,
    };
    if (server.env) entry.environment = server.env;
    return entry;
  }
  const entry: OpencodeRemoteEntry = { type: 'remote', url: server.url ?? '', enabled: true };
  if (server.auth?.headers) entry.headers = server.auth.headers;
  return entry;
}

function xdgConfigHome(ctx: OsContext): string {
  return ctx.env.XDG_CONFIG_HOME ?? joinFor(ctx, ctx.home, '.config');
}

export const opencodeAdapter: ClientAdapter = {
  id: 'opencode',
  // Default `shim`; declares the single-brace `{env:VAR}` dialect (NOT `${...}`) so a profile/server
  // can opt into `native-env` (S19.4).
  secretStrategy: 'shim',
  needsRestart: false,
  // opencode calls http/sse remotes natively; OAuth is prompted on first use.
  remote: { nativeHttp: true, nativeOauth: true, fieldShape: 'url' },
  envInterpolation: (name) => '{env:' + name + '}',

  resolvePath(scope, projectPath, ctx: OsContext = realOsContext()) {
    if (scope === 'user') return joinFor(ctx, xdgConfigHome(ctx), 'opencode', 'opencode.json');
    if (!projectPath) throw new Error('opencode project scope requires a project path.');
    return joinFor(ctx, expandHome(projectPath, ctx.home), 'opencode.json');
  },

  render(servers, ctx: OsContext = realOsContext(), existing?: string): RenderedFile {
    const mcp = Object.create(null) as Record<string, OpencodeEntry>;
    for (const server of [...servers].sort((a, b) => a.name.localeCompare(b.name))) {
      mcp[server.name] = toOpencodeEntry(server);
    }
    // Structural edit preserves comments and every other top-level key; `mcp` is fully owned by
    // mcpfold, so replacing its value matches the canonical server set. Idempotent on re-fold.
    const base = existing && existing.trim().length > 0 ? existing : '{}';
    const edited = applyEdits(
      base,
      modify(base, ['mcp'], mcp, { formattingOptions: { insertSpaces: true, tabSize: 2 } }),
    );
    const scope = servers[0]?.scope ?? 'user';
    const projectPath = servers[0]?.projectPath;
    return {
      path: this.resolvePath(scope, projectPath, ctx),
      contents: edited.endsWith('\n') ? edited : `${edited}\n`,
      needsRestart: false,
    };
  },

  parse(contents): Partial<Config> {
    const raw = parseClientJsonc(contents) as { mcp?: Record<string, unknown> };
    // S19.4: reverse opencode's single-brace `{env:NAME}` dialect back to canonical `${env:NAME}`.
    const canon = envRefCanonicalizer(opencodeAdapter.envInterpolation!);
    const mapVals = (r: Record<string, string>): Record<string, string> =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, canon(v)]));
    const servers = Object.create(null) as Record<string, ServerConfig>;
    for (const [name, value] of Object.entries(raw.mcp ?? {})) {
      if (!value || typeof value !== 'object') continue;
      const entry = value as Record<string, unknown>;
      const type = typeof entry.type === 'string' ? entry.type : '';
      if (type === 'local' || Array.isArray(entry.command)) {
        const cmd = Array.isArray(entry.command) ? (entry.command as string[]) : [];
        const server: ServerConfig = { transport: 'stdio', command: cmd[0] ?? '', tags: [] };
        if (cmd.length > 1) server.args = cmd.slice(1);
        if (entry.environment && typeof entry.environment === 'object') {
          server.env = mapVals(entry.environment as Record<string, string>);
        }
        servers[name] = server;
      } else if (type === 'remote' || typeof entry.url === 'string') {
        const server: ServerConfig = {
          transport: 'streamable-http',
          url: String(entry.url ?? ''),
          tags: [],
        };
        if (entry.headers && typeof entry.headers === 'object') {
          server.auth = {
            type: 'header',
            headers: mapVals(entry.headers as Record<string, string>),
          };
        }
        servers[name] = server;
      }
    }
    return { servers };
  },
};
