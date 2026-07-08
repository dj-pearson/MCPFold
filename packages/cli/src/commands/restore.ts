import { UnknownProfileError, UsageError } from '@mcpfold/core';
import { realOsContext, registerAll, requireAdapter, type OsContext } from '@mcpfold/adapters';
import { loadConfigFromDisk } from '../util/config.js';
import { type BackupInfo, listBackups, restoreBackup } from '../io/backup.js';
import { EXIT } from '../output/exit-codes.js';
import type { CommandOutput } from '../output/render.js';

/**
 * `mcpfold restore [profile]` (S10.5) — roll a client file back to a mcpfold backup. Lists the
 * timestamped `*.mcpfold.bak.*` backups sync writes; with a profile, restores the latest (or a
 * chosen `--at`) atomically, first backing up the current file so the restore is itself reversible.
 * Never prints file contents (a backup may hold an inlined secret), honoring the S9.3 rules.
 */

export interface RestoreTarget {
  profile: string;
  client: string;
  path: string;
  backups: BackupInfo[];
}

export interface RestoreData {
  targets: RestoreTarget[];
  /** Set when a restore was performed (or previewed). */
  restored?: {
    profile: string;
    path: string;
    from: string;
    safetyBackup: string | null;
    dryRun: boolean;
  };
}

export interface RestoreOptions {
  cwd: string;
  /** Profile whose client file to restore; omit to just list backups. */
  profile?: string;
  /** A specific backup timestamp to restore; defaults to the latest. */
  at?: string;
  /** List backups without restoring. */
  list?: boolean;
  dryRun?: boolean;
  osContext?: OsContext;
  now?: Date;
}

function collectTargets(cwd: string, ctx: OsContext, only?: string): RestoreTarget[] {
  const { config } = loadConfigFromDisk(cwd);
  const names = only ? [only] : Object.keys(config.profiles);
  return names.map((name) => {
    const profile = config.profiles[name];
    if (!profile) throw new UnknownProfileError(name, Object.keys(config.profiles));
    const adapter = requireAdapter(profile.client);
    const path = adapter.resolvePath(profile.scope, profile.path, ctx);
    return { profile: name, client: profile.client, path, backups: listBackups(path) };
  });
}

export function runRestore(options: RestoreOptions): CommandOutput<RestoreData> {
  registerAll();
  const ctx = options.osContext ?? realOsContext();

  // List mode: no profile, or an explicit --list.
  if (!options.profile || options.list) {
    const targets = collectTargets(options.cwd, ctx, options.profile);
    return { data: { targets }, human: renderList(targets), exit: EXIT.SUCCESS };
  }

  const [target] = collectTargets(options.cwd, ctx, options.profile);
  if (!target) throw new UnknownProfileError(options.profile, []);

  if (target.backups.length === 0) {
    throw new UsageError(`No backups found for profile "${options.profile}" (${target.path}).`, {
      hint: 'Run `mcpfold sync` first — it writes a backup before each overwrite.',
    });
  }

  const chosen = options.at
    ? target.backups.find((b) => b.timestamp === options.at)
    : target.backups[0];
  if (!chosen) {
    throw new UsageError(`No backup with timestamp "${options.at}" for "${options.profile}".`, {
      hint: 'Run `mcpfold restore --list` to see available timestamps.',
    });
  }

  if (options.dryRun) {
    const data: RestoreData = {
      targets: [target],
      restored: {
        profile: target.profile,
        path: target.path,
        from: chosen.timestamp,
        safetyBackup: null,
        dryRun: true,
      },
    };
    return {
      data,
      human: `Would restore ${target.path}\n  from backup ${chosen.timestamp} (dry-run — nothing written).`,
      exit: EXIT.SUCCESS,
    };
  }

  let safetyBackup: string | null;
  try {
    ({ safetyBackup } = restoreBackup(target.path, chosen.path, options.now));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new UsageError(`Could not restore backup ${chosen.timestamp}: ${msg}`);
  }

  const data: RestoreData = {
    targets: [target],
    restored: {
      profile: target.profile,
      path: target.path,
      from: chosen.timestamp,
      safetyBackup,
      dryRun: false,
    },
  };
  const safety = safetyBackup
    ? `\n  (current file saved to ${safetyBackup} — restore again to undo)`
    : '';
  return {
    data,
    human: `Restored ${target.path}\n  from backup ${chosen.timestamp}${safety}`,
    exit: EXIT.SUCCESS,
  };
}

function renderList(targets: RestoreTarget[]): string {
  if (targets.length === 0) return 'No profiles in the config.';
  const lines: string[] = ['Available backups:'];
  for (const t of targets) {
    lines.push(`  ${t.profile} (${t.client}) → ${t.path}`);
    if (t.backups.length === 0) {
      lines.push('    (no backups)');
    } else {
      for (const b of t.backups) lines.push(`    ${b.timestamp}`);
    }
  }
  lines.push('', 'Restore with `mcpfold restore <profile>` (latest) or `--at <timestamp>`.');
  return lines.join('\n');
}
