import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Config, type ConfigDiff, diffRendered, loadConfig, serialize } from '@mcpfold/core';
import type { CloudApi } from '../cloud/api.js';
import type { KeychainBackend } from '../cloud/token-store.js';
import { endpointError, getAccessToken, requireSession } from '../cloud/session.js';
import { CONFIG_FILENAMES, findConfigPath } from '../util/config.js';
import { atomicWrite } from '../io/atomic-write.js';
import { EXIT } from '../output/exit-codes.js';
import type { CommandOutput } from '../output/render.js';

/**
 * `mcpfold pull` (S6.6) — fetch the latest canonical config from the cloud, diff it against
 * the local config (reusing the S1.6 engine), and apply it on confirmation (or `--yes`).
 * Applying overwrites the local config with the server's canonical version (comments are not
 * preserved — the server stores canonical config, refs intact).
 */

export interface PullOptions {
  cwd: string;
  api: CloudApi;
  backend: KeychainBackend;
  yes?: boolean;
  teamId?: string;
  version?: number;
  now?: () => number;
}

export interface PullData {
  applied: boolean;
  drift: boolean;
  version?: number;
  diff?: ConfigDiff;
}

// Both sides are already canonical Config objects → compare them as JSON via an identity parser.
const identityParser = { parse: (contents: string): Partial<Config> => JSON.parse(contents) };

function localConfigContents(cwd: string): string | undefined {
  const path = findConfigPath(cwd);
  if (!path) return undefined;
  const result = loadConfig(readFileSync(path, 'utf8'));
  return result.ok ? JSON.stringify(result.config) : undefined;
}

function renderDiff(diff: ConfigDiff, version: number): string {
  const lines = [`Server has version ${version}. Changes to apply locally:`];
  for (const s of diff.servers) {
    const mark = s.status === 'added' ? '+' : s.status === 'changed' ? '~' : '-';
    const note =
      s.status === 'unmanaged' ? ' (present locally, absent on server — would be removed)' : '';
    lines.push(`  ${mark} ${s.name}${note}`);
  }
  return lines.join('\n');
}

export async function runPull(opts: PullOptions): Promise<CommandOutput<PullData>> {
  const session = await requireSession(opts.backend);
  const token = await getAccessToken(session, opts.api, opts.backend, opts.now?.());

  let remote;
  try {
    remote = await opts.api.pull(token, { team_id: opts.teamId, version: opts.version });
  } catch (error) {
    throw endpointError(session.endpoint, error);
  }
  if (!remote) {
    return {
      data: { applied: false, drift: false },
      human: 'Nothing to pull — no config on the server yet.',
    };
  }

  const diff = diffRendered(
    { contents: JSON.stringify(remote.config) },
    localConfigContents(opts.cwd),
    identityParser,
  );

  if (!diff.hasDrift) {
    return {
      data: { applied: false, drift: false, version: remote.version },
      human: `✓ Local config already matches the server (version ${remote.version}).`,
    };
  }

  const summary = renderDiff(diff, remote.version);
  if (!opts.yes) {
    return {
      data: { applied: false, drift: true, version: remote.version, diff },
      human: `${summary}\n\nRe-run with --yes to apply.`,
      exit: EXIT.DIFF,
    };
  }

  const target = findConfigPath(opts.cwd) ?? join(opts.cwd, CONFIG_FILENAMES[0]);
  atomicWrite(target, `${serialize(remote.config)}\n`);
  return {
    data: { applied: true, drift: true, version: remote.version, diff },
    human: `${summary}\n\n✓ Applied version ${remote.version} to ${target}.`,
  };
}
