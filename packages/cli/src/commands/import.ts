import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isSecretRef,
  serialize,
  UsageError,
  type Config,
  type ProfileConfig,
  type ServerConfig,
} from '@mcpfold/core';
import { ALL_ADAPTERS, realOsContext, registerAll, type OsContext } from '@mcpfold/adapters';
import { CONFIG_FILENAMES } from '../util/config.js';
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

/** Rewrite hardcoded secret values (non-refs) in env/headers to ${env:...} placeholders. */
function redactSecrets(name: string, server: ServerConfig, flagged: FlaggedSecret[]): ServerConfig {
  const clone: ServerConfig = { ...server };
  const rewrite = (record: Record<string, string>, kind: string): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(record)) {
      if (!isSecretRef(value) && SUSPICIOUS_KEY.test(key)) {
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

export function runImport(options: ImportOptions): CommandOutput<ImportData> {
  registerAll();
  const ctx = options.osContext ?? realOsContext();
  const configPath = join(options.cwd, CONFIG_FILENAMES[0]);

  if (existsSync(configPath) && !options.force && !options.dryRun) {
    throw new UsageError(`${configPath} already exists.`, {
      hint: 'Pass --force to overwrite, or --dry-run to preview the merge.',
    });
  }

  const mergedServers: Record<string, ServerConfig> = {};
  const serverTags: Record<string, Set<string>> = {};
  const serverSig: Record<string, string> = {};
  const conflicts: ImportConflict[] = [];
  const flagged: FlaggedSecret[] = [];
  const sources: string[] = [];
  const profiles: Record<string, ProfileConfig> = {};

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
    sources.push(adapter.id);
    profiles[adapter.id] = { client: adapter.id, scope: 'user', include: [adapter.id] };

    for (const [name, rawServer] of Object.entries(parsedServers)) {
      const server = redactSecrets(name, rawServer, flagged);
      const sig = signature(server);
      const existing = mergedServers[name];
      if (!existing) {
        mergedServers[name] = server;
        serverSig[name] = sig;
        serverTags[name] = new Set([adapter.id]);
      } else if (serverSig[name] === sig) {
        serverTags[name]!.add(adapter.id); // same server across clients → dedupe, union tags
      } else {
        const conflict = conflicts.find((c) => c.name === name);
        if (conflict) conflict.clients.push(adapter.id);
        else conflicts.push({ name, clients: [...serverTags[name]!, adapter.id] });
      }
    }
  }

  // Attach inferred tags.
  for (const [name, tags] of Object.entries(serverTags)) {
    mergedServers[name] = { ...mergedServers[name]!, tags: [...tags].sort() };
  }

  const config: Config = { version: 1, servers: mergedServers, profiles };
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

  writeFileSync(configPath, contents, { encoding: 'utf8' });
  return {
    data: { ...data, wrote: true },
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
