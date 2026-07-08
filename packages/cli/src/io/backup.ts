import { chmodSync, copyFileSync, existsSync } from 'node:fs';

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
  const backupPath = `${targetPath}.mcpfold.bak.${stamp}`;
  copyFileSync(targetPath, backupPath);
  if (process.platform !== 'win32') {
    chmodSync(backupPath, 0o600);
  }
  return backupPath;
}
