import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isSecretRef,
  loadConfig,
  serialize,
  UsageError,
  type Config,
  type ProfileConfig,
  type ServerConfig,
} from '@mcpfold/core';
import {
  ALL_ADAPTERS,
  fromMcpServersShape,
  realOsContext,
  registerAll,
  type OsContext,
} from '@mcpfold/adapters';
import { CONFIG_FILENAMES, MCP_JSON_FILENAME } from '../util/config.js';
import { atomicWrite } from '../io/atomic-write.js';
import { backupIfExists } from '../io/backup.js';
import type { CommandOutput } from '../output/render.js';

/**
 * `mcpfold import` (S3.3) — the zero-friction onboarding path. Reads every detected client
 * config via its adapter, merges servers (dedupe by transport+command/url signature),
 * infers a tag per source client, generates a profile per client, and rewrites any
 * hardcoded secret it finds into an `${env:...}` placeholder rather than copying it
 * verbatim. Conflicting definitions of the same server name are reported, never silently
 * merged. `--dry-run` shows the plan; writing respects `--force`.
 */

export interface ImportConflict {
  name: string;
  clients: string[];
}

export interface FlaggedSecret {
  server: string;
  location: string;
  placeholder: string;
}

export interface ImportData {
  configPath: string;
  wrote: boolean;
  servers: string[];
  profiles: string[];
  conflicts: ImportConflict[];
  flagged: FlaggedSecret[];
  sources: string[];
  /** Path to the timestamped backup of the pre-existing config, when --force overwrote one (S22.16). */
  backup?: string | null;
}

export interface ImportOptions {
  cwd: string;
  force?: boolean;
  dryRun?: boolean;
  osContext?: OsContext;
}

function signature(server: ServerConfig): string {
  return serialize({
    transport: server.transport,
    command: server.command,
    args: server.args,
    url: server.url,
  });
}

const SUSPICIOUS_KEY = /(token|secret|key|auth|pat|password|bearer)/i;
/** A canonical ref (`${scheme:path}`) embedded anywhere in a value (not just the whole value). */
const REF_ANYWHERE = /\$\{[a-z][a-z0-9]*:[^}]+\}/i;

/** Rewrite hardcoded secret values (non-refs) in env/headers to ${env:...} placeholders. */
function redactSecrets(name: string, server: ServerConfig, flagged: FlaggedSecret[]): ServerConfig {
  const clone: ServerConfig = { ...server };
  const rewrite = (record: Record<string, string>, kind: string): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(record)) {
      // Skip values that already reference a secret — whole-value (${env:X}) or embedded
      // (Authorization: Bearer ${env:X}) — so import never destroys an existing ref.
      if (!isSecretRef(value) && !REF_ANYWHERE.test(value) && SUSPICIOUS_KEY.test(key)) {
        const placeholder = `\${env:${`${name}_${key}`.toUpperCase().replace(/[^A-Z0-9]/g, '_')}}`;
        out[key] = placeholder;
        flagged.push({ server: name, location: `${kind}.${key}`, placeholder });
      } else {
        out[key] = value;
      }
    }
    return out;
  };
  if (server.env) clone.env = rewrite(server.env, 'env');
  if (server.auth?.headers)
    clone.auth = { ...server.auth, headers: rewrite(server.auth.headers, 'auth.headers') };
  return clone;
}

/** Tag + profile id used for servers adopted from a bare `.mcp.json` (S20.1). */
const MCP_JSON_SOURCE = 'mcp-json';

/** Bare `${NAME}` (no scheme) in a `.mcp.json` value → a canonical `${env:NAME}` ref. */
function normalizeEnvInterpolation(server: ServerConfig): ServerConfig {
  const rewrite = (record: Record<string, string>): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(record)) {
      out[key] = value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, '${env:$1}');
    }
    return out;
  };
  const clone: ServerConfig = { ...server };
  if (server.env) clone.env = rewrite(server.env);
  if (server.auth?.headers) clone.auth = { ...server.auth, headers: rewrite(server.auth.headers) };
  return clone;
}

/** Accumulator threaded through every import source (adapters + `.mcp.json`). */
interface MergeAcc {
  mergedServers: Record<string, ServerConfig>;
  serverTags: Record<string, Set<string>>;
  serverSig: Record<string, string>;
  conflicts: ImportConflict[];
  flagged: FlaggedSecret[];
  sources: string[];
  profiles: Record<string, ProfileConfig>;
}

/**
 * Fold one source's servers into the accumulator: register a per-source profile, then merge each
 * server (dedupe identical definitions by signature, union their tags, flag genuine conflicts).
 */
function ingestSource(
  sourceId: string,
  profile: { client: ProfileConfig['client']; scope: ProfileConfig['scope'] },
  parsedServers: Record<string, ServerConfig>,
  acc: MergeAcc,
): void {
  acc.sources.push(sourceId);
  acc.profiles[sourceId] = { client: profile.client, scope: profile.scope, include: [sourceId] };

  for (const [name, rawServer] of Object.entries(parsedServers)) {
    const server = redactSecrets(name, rawServer, acc.flagged);
    const sig = signature(server);
    if (!acc.mergedServers[name]) {
      acc.mergedServers[name] = server;
      acc.serverSig[name] = sig;
      acc.serverTags[name] = new Set([sourceId]);
    } else if (acc.serverSig[name] === sig) {
      acc.serverTags[name]!.add(sourceId); // same server across sources → dedupe, union tags
    } else {
      const conflict = acc.conflicts.find((c) => c.name === name);
      if (conflict) conflict.clients.push(sourceId);
      else acc.conflicts.push({ name, clients: [...acc.serverTags[name]!, sourceId] });
    }
  }
}

export function runImport(options: ImportOptions): CommandOutput<ImportData> {
  registerAll();
  const ctx = options.osContext ?? realOsContext();
  const configPath = join(options.cwd, CONFIG_FILENAMES[0]);

  if (existsSync(configPath) && !options.force && !options.dryRun) {
    throw new UsageError(`${configPath} already exists.`, {
      hint: 'Pass --force to overwrite, or --dry-run to preview the merge.',
    });
  }

  const acc: MergeAcc = {
    mergedServers: {},
    serverTags: {},
    serverSig: {},
    conflicts: [],
    flagged: [],
    sources: [],
    profiles: {},
  };

  for (const adapter of ALL_ADAPTERS) {
    let path: string;
    try {
      path = adapter.resolvePath('user', undefined, ctx);
    } catch {
      continue;
    }
    if (!path || !existsSync(path)) continue;

    let parsedServers: Record<string, ServerConfig>;
    try {
      parsedServers = (adapter.parse(readFileSync(path, 'utf8')).servers ?? {}) as Record<
        string,
        ServerConfig
      >;
    } catch {
      continue;
    }
    if (Object.keys(parsedServers).length === 0) continue;
    ingestSource(adapter.id, { client: adapter.id, scope: 'user' }, parsedServers, acc);
  }

  // The flat ecosystem-standard `.mcp.json` (S20.1) is a first-class import source: a bare
  // `<cwd>/.mcp.json` (Claude Code's project file, one of VS's read paths) is folded in like any
  // client. `${VAR}` env interpolation in it becomes a canonical `${env:VAR}` ref.
  const mcpJsonPath = join(options.cwd, MCP_JSON_FILENAME);
  if (existsSync(mcpJsonPath)) {
    try {
      const raw = JSON.parse(readFileSync(mcpJsonPath, 'utf8')) as { mcpServers?: unknown };
      const parsed = (fromMcpServersShape(raw.mcpServers).servers ?? {}) as Record<
        string,
        ServerConfig
      >;
      const normalized: Record<string, ServerConfig> = {};
      for (const [name, server] of Object.entries(parsed)) {
        normalized[name] = normalizeEnvInterpolation(server);
      }
      if (Object.keys(normalized).length > 0) {
        // Scope 'user' (like every adapter-derived profile) keeps the generated canonical config
        // portable + valid — a project scope would require a hardcoded `path`. The user edits this.
        ingestSource(MCP_JSON_SOURCE, { client: 'claude-code', scope: 'user' }, normalized, acc);
      }
    } catch {
      // Unreadable/invalid .mcp.json — skip it rather than fail the whole import.
    }
  }

  const { mergedServers, serverTags, conflicts, flagged, sources, profiles } = acc;

  // Attach inferred tags.
  for (const [name, tags] of Object.entries(serverTags)) {
    mergedServers[name] = { ...mergedServers[name]!, tags: [...tags].sort() };
  }

  const config: Config = { version: 2, servers: mergedServers, profiles };
  const contents = `${serialize(config)}`;

  const data: ImportData = {
    configPath,
    wrote: false,
    servers: Object.keys(mergedServers).sort(),
    profiles: Object.keys(profiles).sort(),
    conflicts,
    flagged,
    sources,
  };

  if (options.dryRun) {
    return { data, human: renderHuman(data, contents, false) };
  }

  // S22.16: re-validate the merged result so a client file that parses into a shape the canonical
  // schema rejects never lands on disk as an invalid mcp.config.jsonc.
  const validated = loadConfig(contents);
  if (!validated.ok) {
    throw new UsageError(
      `The imported config would be invalid and was not written: ${validated.errors[0]?.message}`,
      {
        hint: 'Exclude or fix the offending client server, then re-run `mcpfold import`.',
      },
    );
  }

  // Back up an existing canonical config before the --force overwrite, and write atomically —
  // matching migrate/sync/add so an import can never corrupt or half-write the canonical file (S22.16).
  const backup = backupIfExists(configPath);
  atomicWrite(configPath, contents);
  return {
    data: { ...data, wrote: true, backup },
    human: renderHuman({ ...data, wrote: true }, contents, true),
  };
}

function renderHuman(data: ImportData, contents: string, wrote: boolean): string {
  const lines: string[] = [];
  if (data.sources.length === 0) {
    return 'No installed client configs detected to import.';
  }
  lines.push(`Imported from: ${data.sources.join(', ')}.`);
  lines.push(`Servers: ${data.servers.join(', ') || '(none)'}.`);
  lines.push(`Profiles: ${data.profiles.join(', ')}.`);
  if (data.flagged.length > 0) {
    lines.push('', 'Hardcoded secrets rewritten to ${env:...} placeholders (set the env vars):');
    for (const f of data.flagged) lines.push(`  ${f.server}.${f.location} → ${f.placeholder}`);
  }
  if (data.conflicts.length > 0) {
    lines.push('', 'Conflicts (same name, different definition — resolve manually):');
    for (const c of data.conflicts) lines.push(`  ${c.name}: ${c.clients.join(' vs ')}`);
  }
  lines.push('', wrote ? `Wrote ${data.configPath}` : `Would write ${data.configPath}:`, '');
  if (!wrote) lines.push(contents);
  return lines.join('\n');
}
