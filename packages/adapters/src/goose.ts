import YAML from 'yaml';
import type { Config, ResolvedServer, ServerConfig } from '@mcpfold/core';
import { joinFor, realOsContext } from './paths.js';
import type { ClientAdapter, OsContext, RenderedFile } from './types.js';

/**
 * Goose adapter (S19.2). Goose (block/goose) stores MCP servers as **extensions** in a shared
 * YAML file that also holds non-MCP settings (provider, model, keyring, telemetry), so mcpfold
 * must **merge** into it, preserving every unmanaged top-level key and comment. Verified against
 * goose-docs.ai (config-files guide) and the `ExtensionConfig` enum in block/goose source, July
 * 2026.
 *
 * Format quirks encoded here:
 *   - Root key is `extensions:`, a **map keyed by name** (not a list).
 *   - stdio extensions use `type: stdio` with **`cmd`** (not `command`), `args`, and **`envs`**
 *     (not `env`); remote extensions use `type: streamable_http` (SSE is the legacy `type: sse`)
 *     with **`uri`** (not `url`) and `headers`.
 *   - Non-server extensions (`type: builtin | platform | frontend | inline_python`) are Goose's
 *     own — never mcpfold-managed — so they are preserved untouched.
 *
 * Path (per the config-files guide):
 *   - macOS/Linux: `~/.config/goose/config.yaml`
 *   - Windows:     `%APPDATA%\Block\goose\config\config.yaml`
 *
 * Secret strategy `shim`: Goose has a keyring/`env_keys` mechanism, but folding refs into it is
 * S19.4's native-interpolation job — until then secret-bearing servers fold to the `mcpfold run`
 * shim (matching the other clients). No restart (extensions reload).
 */

/** Extension `type` values that represent an mcpfold-managed MCP server (vs Goose's own kinds). */
const MANAGED_TYPES = new Set(['stdio', 'streamable_http', 'sse']);

const GOOSE_TIMEOUT_DEFAULT = 300;

interface GooseStdioExtension {
  type: 'stdio';
  name: string;
  cmd: string;
  args: string[];
  envs: Record<string, string>;
  enabled: true;
  bundled: false;
  timeout: number;
}

interface GooseRemoteExtension {
  type: 'streamable_http' | 'sse';
  name: string;
  uri: string;
  headers: Record<string, string>;
  enabled: true;
  bundled: false;
  timeout: number;
}

type GooseExtension = GooseStdioExtension | GooseRemoteExtension;

function toGooseExtension(server: ResolvedServer): GooseExtension {
  if (server.transport === 'stdio') {
    return {
      type: 'stdio',
      name: server.name,
      cmd: server.command ?? '',
      args: server.args ?? [],
      envs: server.env ?? {},
      enabled: true,
      bundled: false,
      timeout: GOOSE_TIMEOUT_DEFAULT,
    };
  }
  // Remote: `sse` stays SSE; everything else folds to the current `streamable_http` transport.
  // The bearer token is handled by the shim strategy at fold time, so only literal `auth.headers`
  // pass through here (matching the mcpServers-shape adapters).
  return {
    type: server.transport === 'sse' ? 'sse' : 'streamable_http',
    name: server.name,
    uri: server.url ?? '',
    headers: server.auth?.headers ?? {},
    enabled: true,
    bundled: false,
    timeout: GOOSE_TIMEOUT_DEFAULT,
  };
}

export const gooseAdapter: ClientAdapter = {
  id: 'goose',
  secretStrategy: 'shim',
  needsRestart: false,
  // Goose calls streamable-http/sse remotes natively with header auth (`uri` + `headers`).
  remote: { nativeHttp: true, nativeOauth: true, fieldShape: 'url' },

  resolvePath(scope, _projectPath, ctx: OsContext = realOsContext()) {
    if (scope !== 'user') throw new Error('Goose only supports user scope.');
    if (ctx.platform === 'win32') {
      const appData = ctx.env.APPDATA ?? joinFor(ctx, ctx.home, 'AppData', 'Roaming');
      return joinFor(ctx, appData, 'Block', 'goose', 'config', 'config.yaml');
    }
    return joinFor(ctx, ctx.home, '.config', 'goose', 'config.yaml');
  },

  render(servers, ctx: OsContext = realOsContext(), existing?: string): RenderedFile {
    // Preserve the whole existing document (comments + non-MCP settings) and rewrite only the
    // managed extension entries; Goose's own non-server extensions are kept verbatim.
    const doc =
      existing && existing.trim().length > 0 ? YAML.parseDocument(existing) : new YAML.Document({});
    if (!YAML.isMap(doc.contents)) doc.contents = doc.createNode({}) as never;

    const prior = (YAML.parse(existing ?? '') ?? {}) as { extensions?: Record<string, unknown> };
    const nextExtensions: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(prior.extensions ?? {})) {
      const type = value && typeof value === 'object' ? (value as { type?: string }).type : '';
      if (!type || !MANAGED_TYPES.has(type)) nextExtensions[name] = value; // keep Goose's own
    }
    for (const server of [...servers].sort((a, b) => a.name.localeCompare(b.name))) {
      nextExtensions[server.name] = toGooseExtension(server);
    }
    doc.setIn(['extensions'], nextExtensions);

    const scope = servers[0]?.scope ?? 'user';
    const projectPath = servers[0]?.projectPath;
    return {
      path: this.resolvePath(scope, projectPath, ctx),
      contents: doc.toString(),
      needsRestart: false,
    };
  },

  parse(contents): Partial<Config> {
    const raw = (YAML.parse(contents) ?? {}) as { extensions?: Record<string, unknown> };
    const servers: Record<string, ServerConfig> = {};
    for (const [name, value] of Object.entries(raw.extensions ?? {})) {
      if (!value || typeof value !== 'object') continue;
      const ext = value as Record<string, unknown>;
      const type = typeof ext.type === 'string' ? ext.type : '';
      if (type === 'stdio' || typeof ext.cmd === 'string') {
        const server: ServerConfig = {
          transport: 'stdio',
          command: String(ext.cmd ?? ''),
          tags: [],
        };
        if (Array.isArray(ext.args)) server.args = ext.args as string[];
        if (ext.envs && typeof ext.envs === 'object') {
          server.env = ext.envs as Record<string, string>;
        }
        servers[name] = server;
      } else if (type === 'streamable_http' || type === 'sse' || typeof ext.uri === 'string') {
        const t = type === 'sse' ? 'sse' : 'streamable-http'; // canonical remote (S17.5)
        const server: ServerConfig = { transport: t, url: String(ext.uri ?? ''), tags: [] };
        if (ext.headers && typeof ext.headers === 'object') {
          server.auth = { type: 'header', headers: ext.headers as Record<string, string> };
        }
        servers[name] = server;
      }
    }
    return { servers };
  },
};
