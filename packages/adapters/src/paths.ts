import { homedir } from 'node:os';
import { posix, win32 } from 'node:path';
import type { OsContext } from './types.js';

/**
 * Cross-platform path helpers (S2.1). Every path-resolving function has explicit
 * win32/darwin/linux behavior and is tested per-OS by injecting an {@link OsContext} —
 * never assume `~` expands or that the host separator is correct.
 *
 * We use node's `path.win32` / `path.posix` sub-modules (not the ambient `path`) so a
 * win32 path resolves correctly even when the tests run on a Linux CI runner.
 */

/** The real OS context for production use. */
export function realOsContext(): OsContext {
  return { platform: process.platform, home: homedir(), env: process.env };
}

/** The path module matching a platform (backslashes for win32, forward slashes otherwise). */
export function pathFor(platform: NodeJS.Platform): typeof posix {
  return platform === 'win32' ? (win32 as unknown as typeof posix) : posix;
}

/** Expand a leading `~` to the given home directory. Only a leading `~` is expanded. */
export function expandHome(inputPath: string, home: string): string {
  if (inputPath === '~') return home;
  if (inputPath.startsWith('~/') || inputPath.startsWith('~\\')) {
    return home + inputPath.slice(1);
  }
  return inputPath;
}

/**
 * The base directory a client stores user-scope app config under:
 *   - win32:  %APPDATA%            (fallback ~/AppData/Roaming)
 *   - darwin: ~/Library/Application Support
 *   - linux:  $XDG_CONFIG_HOME     (fallback ~/.config)
 */
export function userConfigDir(ctx: OsContext): string {
  const p = pathFor(ctx.platform);
  if (ctx.platform === 'win32') {
    return ctx.env.APPDATA ?? p.join(ctx.home, 'AppData', 'Roaming');
  }
  if (ctx.platform === 'darwin') {
    return p.join(ctx.home, 'Library', 'Application Support');
  }
  return ctx.env.XDG_CONFIG_HOME ?? p.join(ctx.home, '.config');
}

/** Join path segments using the separator appropriate for `ctx.platform`. */
export function joinFor(ctx: OsContext, ...segments: string[]): string {
  return pathFor(ctx.platform).join(...segments);
}
