import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Reads the CLI's per-user tool-surface discovery cache (S24.6) so the token-budget CodeLens can show
 * REAL per-server tool counts instead of the representative 15-tool assumption (S24.9). Pure and
 * `vscode`-free (Node fs/os/path only) so it is unit-testable, and it never writes — it only consumes
 * what `mcpfold inspect` produced. Location mirrors the CLI's `discoveryCacheDir`.
 */

/** The per-user discovery-cache directory, matching the CLI (`$XDG_CONFIG_HOME|$APPDATA/mcpfold/discovery`). */
export function discoveryCacheDir(
  home: string = homedir(),
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (platform === 'win32') {
    const base = env.APPDATA ?? join(home, 'AppData', 'Roaming');
    return join(base, 'mcpfold', 'discovery');
  }
  const base = env.XDG_CONFIG_HOME ?? join(home, '.config');
  return join(base, 'mcpfold', 'discovery');
}

function snapshotFile(dir: string, server: string): string {
  const safe = server.replace(/[^a-zA-Z0-9._-]/g, '_');
  return join(dir, `${safe}.json`);
}

/**
 * The real tool count for a server from its cached discovery snapshot, or `undefined` when no snapshot
 * exists / it is unreadable / it lacks a numeric `toolCount`. `undefined` is the signal the budget
 * estimator falls back to its representative assumption for that server.
 */
export function cachedToolCount(
  server: string,
  dir: string = discoveryCacheDir(),
): number | undefined {
  const path = snapshotFile(dir, server);
  if (!existsSync(path)) return undefined;
  try {
    const snap = JSON.parse(readFileSync(path, 'utf8')) as { toolCount?: unknown };
    return typeof snap.toolCount === 'number' ? snap.toolCount : undefined;
  } catch {
    return undefined;
  }
}

/** A `toolCountFor` injector for `computeConfigBudget`, backed by the discovery cache. */
export function cacheToolCountFor(
  dir: string = discoveryCacheDir(),
): (name: string) => number | undefined {
  return (name) => cachedToolCount(name, dir);
}
