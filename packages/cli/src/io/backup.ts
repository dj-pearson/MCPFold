import { chmodSync, copyFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { atomicWrite } from './atomic-write.js';

const BAK_INFIX = '.mcpfold.bak.';

/**
 * Timestamped backup of an existing target before overwriting (S3.5, hardened in S9.3).
 * Returns the backup path, or null if there was nothing to back up. Format:
 * `<path>.mcpfold.bak.<timestamp>`.
 *
 * A backed-up client file may contain an inlined secret, so the backup is created with
 * `0600` permissions on POSIX (owner read/write only). On Windows the file inherits the
 * source ACLs. Repo-local `*.mcpfold.bak.*` files are also gitignored (see .gitignore).
 *
 * The timestamp is injectable so tests are deterministic (production passes a real Date).
 */
export function backupIfExists(targetPath: string, now: Date = new Date()): string | null {
  if (!existsSync(targetPath)) return null;
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const backupPath = `${targetPath}${BAK_INFIX}${stamp}`;
  copyFileSync(targetPath, backupPath);
  if (process.platform !== 'win32') {
    chmodSync(backupPath, 0o600);
  }
  return backupPath;
}

export interface BackupInfo {
  /** Full path to the backup file. */
  path: string;
  /** The raw timestamp segment (filesystem-safe ISO), also the selector for `restore --at`. */
  timestamp: string;
}

/** List a target's backups (`<path>.mcpfold.bak.<ts>`), newest first (S10.5). */
export function listBackups(targetPath: string): BackupInfo[] {
  const dir = dirname(targetPath);
  if (!existsSync(dir)) return [];
  const prefix = `${basename(targetPath)}${BAK_INFIX}`;
  return readdirSync(dir)
    .filter((f) => f.startsWith(prefix))
    .map((f) => ({ path: join(dir, f), timestamp: f.slice(prefix.length) }))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp)); // ISO stamps sort chronologically
}

/**
 * Restore `backupPath` over `targetPath` atomically, first backing up the current file so the
 * restore is itself reversible (S10.5). The safety backup inherits the 0600 hardening. Throws if
 * the backup is missing/unreadable.
 */
export function restoreBackup(
  targetPath: string,
  backupPath: string,
  now: Date = new Date(),
): { safetyBackup: string | null } {
  const contents = readFileSync(backupPath, 'utf8'); // throws on missing/corrupt → caller reports
  const safetyBackup = backupIfExists(targetPath, now);
  atomicWrite(targetPath, contents);
  return { safetyBackup };
}
