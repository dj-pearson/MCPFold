import { existsSync, writeFileSync } from 'node:fs';
import { basename, join, resolve as resolvePath } from 'node:path';
import {
  resolveProfile,
  serialize,
  UsageError,
  type Config,
  type ResolvedServer,
} from '@mcpfold/core';
import { loadConfigFromDisk, CONFIG_FILENAMES, MCP_JSON_FILENAME } from '../util/config.js';
import type { CommandOutput } from '../output/render.js';

/**
 * `mcpfold export --mcp-json` (S20.1) — emit the emerging-standard flat `.mcp.json` from the
 * canonical config. See docs/adr/mcp-json-interop.md: `mcp.config.jsonc` stays the source of
 * truth (it carries profiles/tags/refs the flat file can't); `.mcp.json` is how mcpfold talks
 * to everything that reads that file (Claude Code, Visual Studio, …).
 *
 * Secret refs are preserved as env interpolation **where possible** — `${env:NAME}` → `${NAME}`,
 * which a plain `.mcp.json` consumer can resolve from its environment. Refs to schemes the flat
 * file cannot resolve (`infisical`, `op`, `keychain`, `dotenv`) are left verbatim and reported,
 * so a secret is never silently downgraded to a value.
 */

/** A canonical ref (`${scheme:path}`) found in an exported value that isn't env-interpolable. */
export interface UnresolvedRef {
  server: string;
  location: string;
  ref: string;
}

export interface ExportData {
  outputPath: string;
  wrote: boolean;
  format: 'mcp-json';
  profile?: string;
  servers: string[];
  unresolved: UnresolvedRef[];
}

export interface ExportOptions {
  cwd: string;
  /** Restrict the export to one profile's folded server set; otherwise export every server. */
  profile?: string;
  /** Output path; defaults to `<cwd>/.mcp.json`. */
  output?: string;
  force?: boolean;
  dryRun?: boolean;
}

interface McpJsonEntry {
  type?: 'http' | 'sse';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

const REF_RE = /\$\{([a-z][a-z0-9]*):([^}]+)\}/gi;

/** Rewrite `${env:NAME}` → `${NAME}`; leave (and record) refs a flat `.mcp.json` can't resolve. */
function toEnvInterpolation(
  value: string,
  server: string,
  location: string,
  unresolved: UnresolvedRef[],
): string {
  return value.replace(REF_RE, (whole, scheme: string, path: string) => {
    if (scheme.toLowerCase() === 'env') return `\${${path}}`;
    unresolved.push({ server, location, ref: whole });
    return whole;
  });
}

function mapRecord(
  record: Record<string, string>,
  server: string,
  kind: string,
  unresolved: UnresolvedRef[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    out[key] = toEnvInterpolation(value, server, `${kind}.${key}`, unresolved);
  }
  return out;
}

/** One resolved server → a flat `.mcp.json` entry, interpolating secret refs where possible. */
function toMcpJsonEntry(server: ResolvedServer, unresolved: UnresolvedRef[]): McpJsonEntry {
  if (server.transport === 'stdio') {
    const entry: McpJsonEntry = { command: server.command ?? '' };
    if (server.args) entry.args = server.args;
    if (server.env) entry.env = mapRecord(server.env, server.name, 'env', unresolved);
    return entry;
  }

  const entry: McpJsonEntry = {
    type: server.transport === 'sse' ? 'sse' : 'http',
    url: server.url ?? '',
  };
  const headers: Record<string, string> = {};
  if (server.auth?.type === 'bearer' && server.auth.token) {
    headers.Authorization = `Bearer ${toEnvInterpolation(
      server.auth.token,
      server.name,
      'auth.token',
      unresolved,
    )}`;
  }
  for (const [name, value] of Object.entries(server.auth?.headers ?? {})) {
    headers[name] = toEnvInterpolation(value, server.name, `auth.headers.${name}`, unresolved);
  }
  if (Object.keys(headers).length > 0) entry.headers = headers;
  return entry;
}

/** Every server as a resolved entry (no profile filter) — used when `--profile` is omitted. */
function allServers(config: Config): ResolvedServer[] {
  return Object.keys(config.servers)
    .sort()
    .map((name) => {
      const s = config.servers[name]!;
      return { name, ...s, client: 'claude-code', scope: 'project' } as ResolvedServer;
    });
}

export function runExport(options: ExportOptions): CommandOutput<ExportData> {
  if (options.output && CONFIG_FILENAMES.includes(basename(options.output) as never)) {
    throw new UsageError(
      `Refusing to export over the canonical file "${basename(options.output)}".`,
      { hint: 'Export to .mcp.json (the default) or another path — never onto mcp.config.jsonc.' },
    );
  }

  const { config } = loadConfigFromDisk(options.cwd);
  const outputPath = options.output
    ? resolvePath(options.cwd, options.output)
    : join(options.cwd, MCP_JSON_FILENAME);

  const servers = options.profile ? resolveProfile(config, options.profile) : allServers(config);

  const unresolved: UnresolvedRef[] = [];
  const mcpServers: Record<string, McpJsonEntry> = {};
  for (const server of servers) mcpServers[server.name] = toMcpJsonEntry(server, unresolved);

  const contents = `${serialize({ mcpServers })}`;
  const data: ExportData = {
    outputPath,
    wrote: false,
    format: 'mcp-json',
    profile: options.profile,
    servers: Object.keys(mcpServers).sort(),
    unresolved,
  };

  if (options.dryRun) {
    return { data, human: renderHuman(data, contents, false) };
  }

  if (existsSync(outputPath) && !options.force) {
    throw new UsageError(`${outputPath} already exists.`, {
      hint: 'Pass --force to overwrite, or --dry-run to preview.',
    });
  }

  writeFileSync(outputPath, contents, { encoding: 'utf8' });
  return {
    data: { ...data, wrote: true },
    human: renderHuman({ ...data, wrote: true }, contents, true),
  };
}

function renderHuman(data: ExportData, contents: string, wrote: boolean): string {
  const lines: string[] = [];
  const scope = data.profile ? `profile "${data.profile}"` : 'all servers';
  lines.push(`Exporting ${scope} → .mcp.json (${data.servers.length} server(s)).`);
  if (data.unresolved.length > 0) {
    lines.push(
      '',
      'Refs a plain .mcp.json cannot resolve were left verbatim (resolve them before use, or',
      'run through mcpfold):',
    );
    for (const u of data.unresolved) lines.push(`  ${u.server}.${u.location} → ${u.ref}`);
  }
  lines.push('', wrote ? `Wrote ${data.outputPath}` : `Would write ${data.outputPath}:`, '');
  if (!wrote) lines.push(contents);
  return lines.join('\n');
}
