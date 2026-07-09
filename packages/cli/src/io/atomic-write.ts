import { randomBytes } from 'node:crypto';
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Monotonic per-process counter so two writes from the same pid within the same
// millisecond still get distinct temp names.
let tmpCounter = 0;

/**
 * Atomic file write (S3.5): write to a temp file in the same directory, then rename over
 * the target. A rename on the same filesystem is atomic, so a reader never sees a
 * half-written config and a crash mid-write leaves the original intact. On failure the
 * temp file is cleaned up.
 *
 * The temp filename is made unique per write (pid + counter + random suffix, S16.7) so
 * overlapping writes to the same target — e.g. `sync --watch` firing while a manual
 * `sync`/`pull` runs — never race on a single temp path and rename each other's
 * partially-written file over the target. The name keeps the `.mcpfold.tmp` suffix so it
 * stays hidden/prefixed and covered by .gitignore.
 */
export function atomicWrite(targetPath: string, contents: string): void {
  const dir = dirname(targetPath);
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, tempName(basenameSafe(targetPath)));
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

/**
 * Unique temp filename in the target dir: hidden dot-prefix, then the target basename,
 * then pid + a monotonic counter + random bytes for collision safety, then the
 * `.mcpfold.tmp` suffix so it matches the gitignore rule.
 *
 * Exported for unit testing the S16.7 collision-safety invariant directly (node:fs named
 * exports can't be spied on under ESM, so we assert the name generator instead).
 * @internal
 */
export function tempName(base: string): string {
  const unique = `${process.pid.toString(36)}.${(tmpCounter++).toString(36)}.${randomBytes(6).toString('hex')}`;
  return `.${base}.${unique}.mcpfold.tmp`;
}
