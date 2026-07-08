import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Atomic file write (S3.5): write to a temp file in the same directory, then rename over
 * the target. A rename on the same filesystem is atomic, so a reader never sees a
 * half-written config and a crash mid-write leaves the original intact. On failure the
 * temp file is cleaned up.
 */
export function atomicWrite(targetPath: string, contents: string): void {
  const dir = dirname(targetPath);
  mkdirSync(dir, { recursive: true });
  // Deterministic-ish temp name in the same dir (same filesystem → rename is atomic).
  const tmp = join(dir, `.${basenameSafe(targetPath)}.mcpfold.tmp`);
  try {
    writeFileSync(tmp, contents, { encoding: 'utf8', mode: 0o600 });
    renameSync(tmp, targetPath);
  } catch (error) {
    try {
      rmSync(tmp, { force: true });
    } catch {
      // best-effort cleanup
    }
    throw error;
  }
}

function basenameSafe(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || 'file';
}
