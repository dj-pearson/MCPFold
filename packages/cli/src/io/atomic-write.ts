import { randomBytes } from 'node:crypto';
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  realpathSync,
  renameSync,
  rmSync,
  writeSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

// Monotonic per-process counter so two writes from the same pid within the same
// millisecond still get distinct temp names.
let tmpCounter = 0;

/**
 * Atomic, crash-durable file write (S3.5, hardened S22.20): write to a temp file in the same
 * directory, fsync it, rename it over the target, then fsync the directory. A rename on the same
 * filesystem is atomic, so a reader never sees a half-written config; the fsyncs make the
 * crash-mid-write-leaves-original-intact guarantee real (a power loss just after `renameSync` can
 * otherwise lose the rename or leave a zero-length file).
 *
 * Symlink intent (S22.20): a symlinked target is FOLLOWED — the write goes to the link's real file,
 * so a user who symlinks their config keeps the symlink instead of having it replaced by a regular
 * file. (`renameSync` over a link would otherwise clobber it.)
 *
 * The temp filename is made unique per write (pid + counter + random suffix, S16.7) so overlapping
 * writes to the same target — e.g. `sync --watch` firing while a manual `sync`/`pull` runs — never
 * race on a single temp path and rename each other's partially-written file over the target. The
 * name keeps the `.mcpfold.tmp` suffix so it stays hidden/prefixed and covered by .gitignore.
 */
export function atomicWrite(targetPath: string, contents: string): void {
  // Follow a symlink to its real file so the link is preserved, not replaced. A path that does not
  // exist yet (or isn't a link) resolves to itself.
  let realTarget = targetPath;
  try {
    realTarget = realpathSync(targetPath);
  } catch {
    // Target doesn't exist yet — write to the path as given.
  }
  const dir = dirname(realTarget);
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, tempName(basenameSafe(realTarget)));
  let fd: number | undefined;
  try {
    fd = openSync(tmp, 'w', 0o600);
    writeSync(fd, contents, null, 'utf8');
    fsyncSync(fd); // flush file data before the rename makes it visible
    closeSync(fd);
    fd = undefined;
    renameSync(tmp, realTarget);
    fsyncDir(dir); // flush the directory entry so the rename itself survives a crash
  } catch (error) {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // best-effort
      }
    }
    try {
      rmSync(tmp, { force: true });
    } catch {
      // best-effort cleanup
    }
    throw error;
  }
}

/** fsync a directory so a just-completed rename is durable. No-op where unsupported (win32). */
function fsyncDir(dir: string): void {
  if (process.platform === 'win32') return; // can't open a directory as a fd on Windows
  let dirFd: number | undefined;
  try {
    dirFd = openSync(dir, 'r');
    fsyncSync(dirFd);
  } catch {
    // Some filesystems don't support directory fsync — best-effort durability.
  } finally {
    if (dirFd !== undefined) {
      try {
        closeSync(dirFd);
      } catch {
        // best-effort
      }
    }
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
