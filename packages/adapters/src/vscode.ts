import {
  serialize,
  isSecretRef,
  type Config,
  type ResolvedServer,
  type ServerConfig,
} from '@mcpfold/core';
import { joinFor, realOsContext, userConfigDir } from './paths.js';
import type { ClientAdapter, OsContext, RenderedFile } from './types.js';

/**
 * VS Code adapter (S2.5, spec §5). Two traps this encodes:
 *   1. The root key is **`servers`**, NOT `mcpServers` — copying a Claude config in fails
 *      silently. A regression test locks this.
 *   2. Secrets use VS Code's own indirection: a bearer token becomes an
 *      `Authorization: Bearer ${input:<id>}` header plus a matching entry in a top-level
 *      `inputs` array (secretStrategy `native-input`). VS Code prompts once and stores it.
 * No restart needed (needsRestart=false).
 */

interface VscodeInput {
  id: string;
  type: 'promptString';
  description: string;
  password: true;
}

interface VscodeServerEntry {
  type: 'stdio' | 'http' | 'sse';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

function inputId(serverName: string, key: string): string {
  return `${serverName}-${key}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

function toVscodeEntry(server: ResolvedServer): {
  entry: VscodeServerEntry;
  inputs: VscodeInput[];
} {
  const inputs: VscodeInput[] = [];
  if (server.transport === 'stdio') {
    const entry: VscodeServerEntry = { type: 'stdio', command: server.command ?? '' };
    if (server.args) entry.args = server.args;
    if (server.env) entry.env = server.env;
    return { entry, inputs };
  }

  const entry: VscodeServerEntry = {
    type: server.transport === 'sse' ? 'sse' : 'http',
    url: server.url ?? '',
  };
  const headers: Record<string, string> = {};

  // Bearer token → Authorization header backed by a prompted input.
  if (server.auth?.type === 'bearer' && server.auth.token) {
    const id = inputId(server.name, 'token');
    headers.Authorization = `Bearer \${input:${id}}`;
    inputs.push({
      id,
      type: 'promptString',
      description: `Token for ${server.name}`,
      password: true,
    });
  }
  // Explicit headers: secret refs become inputs; literals pass through.
  for (const [name, value] of Object.entries(server.auth?.headers ?? {})) {
    if (isSecretRef(value)) {
      const id = inputId(server.name, name);
      headers[name] = `\${input:${id}}`;
      inputs.push({
        id,
        type: 'promptString',
        description: `${name} for ${server.name}`,
        password: true,
      });
    } else {
      headers[name] = value;
    }
  }
  if (Object.keys(headers).length > 0) entry.headers = headers;
  return { entry, inputs };
}

export const vscodeAdapter: ClientAdapter = {
  id: 'vscode',
  secretStrategy: 'native-input',
  needsRestart: false,
  // Native HTTP remotes with OAuth (verified July 2026); explicit `type` in the `servers` dialect.
  remote: { nativeHttp: true, nativeOauth: true, fieldShape: 'type+url' },

  resolvePath(scope, projectPath, ctx: OsContext = realOsContext()) {
    if (scope === 'workspace' || scope === 'project') {
      if (!projectPath) throw new Error('VS Code workspace scope requires a project path.');
      return joinFor(ctx, projectPath, '.vscode', 'mcp.json');
    }
    // User profile mcp.json (per OS).
    return joinFor(ctx, userConfigDir(ctx), 'Code', 'User', 'mcp.json');
  },

  render(servers, ctx: OsContext = realOsContext()): RenderedFile {
    const serversObj: Record<string, VscodeServerEntry> = {};
    const inputsById = new Map<string, VscodeInput>();
    for (const server of servers) {
      const { entry, inputs } = toVscodeEntry(server);
      serversObj[server.name] = entry;
      for (const input of inputs) inputsById.set(input.id, input);
    }
    const inputs = [...inputsById.values()].sort((a, b) => a.id.localeCompare(b.id));
    const scope = servers[0]?.scope ?? 'user';
    const projectPath = servers[0]?.projectPath;
    // NOTE the root key is "servers", not "mcpServers".
    return {
      path: this.resolvePath(scope, projectPath, ctx),
      contents: serialize({ servers: serversObj, inputs }),
      needsRestart: false,
    };
  },

  parse(contents): Partial<Config> {
    const raw = JSON.parse(contents) as { servers?: Record<string, unknown> };
    const servers: Record<string, ServerConfig> = {};
    for (const [name, value] of Object.entries(raw.servers ?? {})) {
      if (!value || typeof value !== 'object') continue;
      const entry = value as Record<string, unknown>;
      if (entry.type === 'stdio' || typeof entry.command === 'string') {
        const server: ServerConfig = {
          transport: 'stdio',
          command: String(entry.command ?? ''),
          tags: [],
        };
        if (Array.isArray(entry.args)) server.args = entry.args as string[];
        if (entry.env && typeof entry.env === 'object')
          server.env = entry.env as Record<string, string>;
        servers[name] = server;
      } else if (typeof entry.url === 'string') {
        const t = entry.type === 'sse' ? 'sse' : 'streamable-http'; // canonical remote (S17.5)
        const server: ServerConfig = { transport: t, url: entry.url, tags: [] };
        if (entry.headers && typeof entry.headers === 'object') {
          server.auth = { type: 'header', headers: entry.headers as Record<string, string> };
        }
        servers[name] = server;
      }
    }
    return { servers };
  },
};
