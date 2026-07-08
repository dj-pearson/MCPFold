import { join } from 'node:path';
import {
  type Config,
  type ConfigDiff,
  diffRendered,
  loadConfig,
  serialize,
  UsageError,
} from '@mcpfold/core';
import { readFileSync } from 'node:fs';
import type { CloudApi } from '../cloud/api.js';
import type { KeychainBackend } from '../cloud/token-store.js';
import { endpointError, getAccessToken, requireSession } from '../cloud/session.js';
import { loadSigningKey, verifyConfig } from '../trust/signing.js';
import { fileTrustGate, type TrustGate, untrustedServers } from '../trust/tofu.js';
import { CONFIG_FILENAMES, findConfigPath } from '../util/config.js';
import { atomicWrite } from '../io/atomic-write.js';
import { EXIT } from '../output/exit-codes.js';
import type { CommandOutput } from '../output/render.js';

/**
 * `mcpfold pull` (S6.6 + S9.2) — fetch the latest canonical config from the cloud, VERIFY its
 * integrity signature (S9.2), diff it against local (reusing the S1.6 engine), and apply it on
 * confirmation (`--yes`). Applying `--yes` also pre-approves the pulled servers' launch commands
 * in the local trust store (documented as reducing the TOFU protection).
 */

export interface PullOptions {
  cwd: string;
  api: CloudApi;
  backend: KeychainBackend;
  yes?: boolean;
  teamId?: string;
  version?: number;
  now?: () => number;
  /** Trust gate (TOFU); defaults to the per-machine store. Injectable for tests. */
  gate?: TrustGate;
}

export interface PullData {
  applied: boolean;
  drift: boolean;
  version?: number;
  diff?: ConfigDiff;
}

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

  // --- Version-integrity verification (S9.2) --------------------------------------------
  const warnings: string[] = [];
  const key = await loadSigningKey(opts.backend);
  if (key && remote.signature) {
    // A present-but-invalid signature means the stored config was tampered with → hard reject.
    if (!verifyConfig(remote.config, remote.signature, key)) {
      throw new UsageError(
        'Refusing to apply: the config version SIGNATURE is INVALID (possible tampering).',
        { hint: 'The stored config does not match its signature — do not apply it.' },
      );
    }
  } else if (remote.signature) {
    warnings.push(
      'This config is signed but no local signing key is present — integrity not verified.',
    );
  } else {
    // No signature stored yet (older push / server without signing) — cannot verify integrity.
    warnings.push('This config version is unsigned — integrity could not be verified.');
  }

  const gate = opts.gate ?? fileTrustGate();
  const diff = diffRendered(
    { contents: JSON.stringify(remote.config) },
    localConfigContents(opts.cwd),
    identityParser,
  );

  if (!diff.hasDrift) {
    return {
      data: { applied: false, drift: false, version: remote.version },
      human: `✓ Local config already matches the server (version ${remote.version}).`,
      warnings,
    };
  }

  const summary = renderDiff(diff, remote.version);
  const untrusted = untrustedServers(remote.config, gate);

  if (!opts.yes) {
    if (untrusted.length > 0) {
      warnings.push(
        `${untrusted.length} launch command(s) will need trust before they run: ` +
          `${untrusted.map((u) => u.name).join(', ')} (\`--yes\` pre-approves them).`,
      );
    }
    return {
      data: { applied: false, drift: true, version: remote.version, diff },
      human: `${summary}\n\nRe-run with --yes to apply.`,
      warnings,
      exit: EXIT.DIFF,
    };
  }

  const target = findConfigPath(opts.cwd) ?? join(opts.cwd, CONFIG_FILENAMES[0]);
  atomicWrite(target, `${serialize(remote.config)}\n`);
  // --yes is explicit confirmation → pre-approve the pulled launch commands (S9.2).
  for (const u of untrusted) gate.approve(u.name, u.entry);

  return {
    data: { applied: true, drift: true, version: remote.version, diff },
    human: `${summary}\n\n✓ Applied version ${remote.version} to ${target}.`,
    warnings,
  };
}
