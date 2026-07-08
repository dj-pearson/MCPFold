import { copyFileSync, existsSync } from 'node:fs';

/**
 * Timestamped backup of an existing target before overwriting (S3.5). Returns the backup
 * path, or null if there was nothing to back up. Format: `<path>.mcpfold.bak.<timestamp>`.
 *
 * The timestamp is injectable so tests are deterministic (production passes a real Date).
 */
export function backupIfExists(targetPath: string, now: Date = new Date()): string | null {
  if (!existsSync(targetPath)) return null;
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const backupPath = `${targetPath}.mcpfold.bak.${stamp}`;
  copyFileSync(targetPath, backupPath);
  return backupPath;
}
