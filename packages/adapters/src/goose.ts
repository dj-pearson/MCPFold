import type { Config, ResolvedServer, ServerConfig } from '@mcpfold/core';
import { parseDocument, stringify } from 'yaml';
import { joinFor, realOsContext } from './paths.js';
import { normalizeServer } from './shared.js';
import type { ClientAdapter, OsContext, RenderedFile } from './types.js';

/**
 * Goose adapter (S19.2) — bespoke YAML. Block's Goose keeps its MCP servers under an `extensions:`
 * map in `~/.config/goose/config.yaml`, a SHARED file that also holds all of Goose's own settings
 * (`GOOSE_PROVIDER`, `GOOSE_MODEL`, …). So writing MUST preserve every unmanaged root key (and
 * comments), replacing only `extensions`. Remote servers use `type: streamable_http` + `uri`
 * (SSE is deprecated upstream; we still parse it). Verified July 2026 against
 * github.com/block/goose documentation/docs/guides/config-files.md.
 *
 * Path:
 *   - macOS/Linux: ~/.config/goose/config.yaml
 *   - Windows:     %APPDATA%\Block\goose\config\config.yaml
 */

const remote = { nativeHttp: true, nativeOauth: true, fieldShape: 'url' as const };

interface GooseExtension {
  name: string;
  type: string;
  enabled: boolean;
  cmd?: string;
  args?: string[];
  envs?: Record<string, string>;
  uri?: string;
  headers?: Record<string, string>;
}

function toExtensions(servers: ResolvedServer[]): Record<string, GooseExtension> {
  const out: Record<string, GooseExtension> = {};
  for (const server of servers) {
    const n = normalizeServer(server, remote);
    if (n.kind === 'stdio') {
      const ext: GooseExtension = {
        name: server.name,
        type: 'stdio',
        enabled: true,
        cmd: n.command,
      };
      if (n.args) ext.args = n.args;
      if (n.env && Object.keys(n.env).length > 0) ext.envs = n.env;
      out[server.name] = ext;
    } else {
      const ext: GooseExtension = {
        name: server.name,
        type: n.sse ? 'sse' : 'streamable_http',
        enabled: true,
        uri: n.url,
      };
      if (n.headers && Object.keys(n.headers).length > 0) ext.headers = n.headers;
      out[server.name] = ext;
    }
  }
  return out;
}

export const gooseAdapter: ClientAdapter = {
  id: 'goose',
  secretStrategy: 'shim',
  needsRestart: false,
  remote,
  resolvePath(scope, _projectPath, ctx: OsContext = realOsContext()) {
    if (scope !== 'user') throw new Error('Goose only supports user scope.');
    if (ctx.platform === 'win32') {
      const appData = ctx.env.APPDATA ?? joinFor(ctx, ctx.home, 'AppData', 'Roaming');
      return joinFor(ctx, appData, 'Block', 'goose', 'config', 'config.yaml');
    }
    return joinFor(ctx, ctx.home, '.config', 'goose', 'config.yaml');
  },
  render(servers, ctx = realOsContext(), existing?: string): RenderedFile {
    const extensions = toExtensions(servers);
    let contents: string;
    if (existing && existing.trim()) {
      // Preserve every unmanaged key + comment; replace only `extensions`.
      const doc = parseDocument(existing);
      doc.set('extensions', extensions);
      contents = doc.toString();
    } else {
      contents = stringify({ extensions });
    }
    const scope = servers[0]?.scope ?? 'user';
    return {
      path: this.resolvePath(scope, servers[0]?.projectPath, ctx),
      contents,
      needsRestart: false,
    };
  },
  parse(contents): Partial<Config> {
    const raw = (parseDocument(contents).toJS() ?? {}) as { extensions?: Record<string, unknown> };
    const servers: Record<string, ServerConfig> = {};
    for (const [name, value] of Object.entries(raw.extensions ?? {})) {
      if (!value || typeof value !== 'object') continue;
      const e = value as Record<string, unknown>;
      const type = String(e.type ?? '');
      if (type === 'stdio' || typeof e.cmd === 'string') {
        const s: ServerConfig = { transport: 'stdio', command: String(e.cmd ?? ''), tags: [] };
        if (Array.isArray(e.args)) s.args = e.args as string[];
        if (e.envs && typeof e.envs === 'object' && Object.keys(e.envs).length > 0) {
          s.env = e.envs as Record<string, string>;
        }
        servers[name] = s;
      } else if (typeof e.uri === 'string' || typeof e.url === 'string') {
        const transport = type === 'sse' ? 'sse' : 'streamable-http';
        const s: ServerConfig = { transport, url: String(e.uri ?? e.url), tags: [] };
        if (e.headers && typeof e.headers === 'object') {
          s.auth = { type: 'header', headers: e.headers as Record<string, string> };
        }
        servers[name] = s;
      }
    }
    return { servers };
  },
};
