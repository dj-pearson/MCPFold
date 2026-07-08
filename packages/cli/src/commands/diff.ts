import { existsSync, readFileSync } from 'node:fs';
import { diffRendered, resolveProfile, UnknownProfileError, type ConfigDiff } from '@mcpfold/core';
import { realOsContext, registerAll, requireAdapter, type OsContext } from '@mcpfold/adapters';
import { loadConfigFromDisk } from '../util/config.js';
import { EXIT } from '../output/exit-codes.js';
import type { CommandOutput } from '../output/render.js';

/**
 * `mcpfold diff` (S3.6) — show drift between the canonical config and what's on disk,
 * per client. Uses the S1.6 engine. Distinguishes added / changed / unmanaged servers and
 * missing files. Exits nonzero (EXIT.DIFF) when any drift exists so CI can gate on it;
 * `--json` emits the structured diff for tooling.
 */

export interface ClientDiff {
  profile: string;
  client: string;
  path: string;
  diff: ConfigDiff;
}

export interface DiffData {
  clients: ClientDiff[];
  drift: boolean;
}

export interface DiffOptions {
  cwd: string;
  profile?: string;
  osContext?: OsContext;
}

export function runDiff(options: DiffOptions): CommandOutput<DiffData> {
  registerAll();
  const ctx = options.osContext ?? realOsContext();
  const { config } = loadConfigFromDisk(options.cwd);

  if (options.profile && !config.profiles[options.profile]) {
    throw new UnknownProfileError(options.profile, Object.keys(config.profiles));
  }
  const profileNames = options.profile ? [options.profile] : Object.keys(config.profiles).sort();

  const clients: ClientDiff[] = [];
  let drift = false;
  for (const name of profileNames) {
    const profile = config.profiles[name]!;
    const adapter = requireAdapter(profile.client);
    const file = adapter.render(resolveProfile(config, name), ctx);
    const onDisk = existsSync(file.path) ? readFileSync(file.path, 'utf8') : undefined;
    const diff = diffRendered(file, onDisk, adapter);
    if (diff.hasDrift) drift = true;
    clients.push({ profile: name, client: profile.client, path: file.path, diff });
  }

  return {
    data: { clients, drift },
    human: renderHuman(clients, drift),
    exit: drift ? EXIT.DIFF : EXIT.SUCCESS,
  };
}

function renderHuman(clients: ClientDiff[], drift: boolean): string {
  if (clients.length === 0) return 'No profiles to diff.';
  const blocks = clients.map(({ client, profile, path, diff }) => {
    const header = `${client} (${profile}) → ${path}`;
    if (diff.fileMissing)
      return `${header}\n  file missing — sync would create it (${diff.servers.length} server(s))`;
    if (!diff.hasDrift) return `${header}\n  ✓ up to date`;
    const rows = diff.servers.map((s) => {
      if (s.status === 'added') return `  + ${s.name} (would be added)`;
      if (s.status === 'unmanaged')
        return `  ~ ${s.name} (unmanaged — present on disk, not in canonical)`;
      const fields = (s.changes ?? []).map((c) => c.field).join(', ');
      return `  Δ ${s.name} (changed: ${fields})`;
    });
    return [header, ...rows].join('\n');
  });
  const footer = drift ? '\nDrift detected.' : '\nNo drift.';
  return blocks.join('\n\n') + footer;
}
