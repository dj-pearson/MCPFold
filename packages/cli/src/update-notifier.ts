import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { realOsContext, userConfigDir, type OsContext } from '@mcpfold/adapters';

/**
 * Update notifier (S11.3). A quiet, cached, opt-out-able heads-up when a newer mcpfold is
 * published. It NEVER blocks a command: the notice is printed from a disk cache (instant), and the
 * latest version is refreshed in a detached background process for next time. Off in non-TTY/CI
 * and via DO_NOT_TRACK / MCPFOLD_NO_UPDATE_NOTIFIER (aligned with the S8.3 telemetry conventions).
 * Only a version number is ever fetched — no config, path, or identifying data leaves the machine.
 */

export type UpdateChannel = 'npm' | 'homebrew' | 'scoop' | 'binary';

export interface NotifierEnv {
  CI?: string;
  DO_NOT_TRACK?: string;
  MCPFOLD_NO_UPDATE_NOTIFIER?: string;
}

export function isNotifierEnabled(env: NotifierEnv, isTTY: boolean): boolean {
  if (!isTTY) return false;
  if (env.CI) return false;
  if (env.DO_NOT_TRACK === '1' || env.DO_NOT_TRACK === 'true') return false;
  if (env.MCPFOLD_NO_UPDATE_NOTIFIER === '1' || env.MCPFOLD_NO_UPDATE_NOTIFIER === 'true')
    return false;
  return true;
}

/** Guess how mcpfold was installed, to print the right upgrade command. */
export function detectChannel(execPath: string): UpdateChannel {
  const p = execPath.replace(/\\/g, '/').toLowerCase();
  if (p.includes('/cellar/') || p.includes('/homebrew/') || p.includes('linuxbrew'))
    return 'homebrew';
  if (p.includes('/scoop/')) return 'scoop';
  const base = p.split('/').pop() ?? '';
  // A standalone binary runs as `mcpfold` itself; an npm/npx install runs under `node`.
  if (base.startsWith('mcpfold')) return 'binary';
  return 'npm';
}

export function upgradeCommand(channel: UpdateChannel): string {
  switch (channel) {
    case 'homebrew':
      return 'brew upgrade mcpfold';
    case 'scoop':
      return 'scoop update mcpfold';
    case 'binary':
      return 'curl -fsSL https://mcpfold.com/install.sh | sh';
    case 'npm':
    default:
      return 'npm install -g mcpfold@latest';
  }
}

/** True if `latest` is a newer semver than `current` (patch-level, ignores pre-release tags). */
export function isNewer(latest: string, current: string): boolean {
  const parse = (v: string) =>
    v
      .replace(/^v/, '')
      .split('-')[0]!
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
  const a = parse(latest);
  const b = parse(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

interface Cache {
  latest: string;
  checkedAt: string;
}

export function defaultCachePath(ctx: OsContext = realOsContext()): string {
  return join(userConfigDir(ctx), 'mcpfold', 'update-check.json');
}

function readCache(path: string): Cache | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Cache;
  } catch {
    return null;
  }
}

export function renderNotice(current: string, latest: string, command: string): string {
  return [
    '',
    `  ✨ Update available: ${current} → ${latest}`,
    `     Run \`${command}\` to update.`,
    '',
  ].join('\n');
}

export interface NoticeDeps {
  currentVersion: string;
  cachePath?: string;
  env?: NotifierEnv;
  isTTY?: boolean;
  execPath?: string;
}

/** The update notice from the disk cache — instant, never blocks. null if none / disabled. */
export function getUpdateNotice(deps: NoticeDeps): string | null {
  const env = deps.env ?? (process.env as NotifierEnv);
  const isTTY = deps.isTTY ?? Boolean(process.stdout.isTTY);
  if (!isNotifierEnabled(env, isTTY)) return null;

  const cache = readCache(deps.cachePath ?? defaultCachePath());
  if (!cache?.latest || !isNewer(cache.latest, deps.currentVersion)) return null;

  const channel = detectChannel(deps.execPath ?? process.execPath);
  return renderNotice(deps.currentVersion, cache.latest, upgradeCommand(channel));
}

/**
 * Fetch the latest published version and update the cache (S11.3). Meant to run in a detached
 * background process. Skips the fetch if the cache is still fresh; silent on any failure (offline,
 * registry error) — never throws, never corrupts the cache.
 */
export async function refreshUpdateCache(
  deps: {
    cachePath?: string;
    now?: () => Date;
    intervalMs?: number;
    fetchLatest?: () => Promise<string | null>;
  } = {},
): Promise<void> {
  const cachePath = deps.cachePath ?? defaultCachePath();
  const now = deps.now ?? (() => new Date());
  const intervalMs = deps.intervalMs ?? 24 * 60 * 60 * 1000;

  const cache = readCache(cachePath);
  if (cache && now().getTime() - new Date(cache.checkedAt).getTime() < intervalMs) return; // fresh

  const latest = await (deps.fetchLatest ?? fetchLatestFromNpm)();
  if (!latest) return; // silent on failure
  try {
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, JSON.stringify({ latest, checkedAt: now().toISOString() }));
  } catch {
    // best-effort cache write
  }
}

/** Whether a background refresh is due (cache missing or older than the interval). */
export function isRefreshDue(
  cachePath: string,
  now: Date,
  intervalMs = 24 * 60 * 60 * 1000,
): boolean {
  if (!existsSync(cachePath)) return true;
  const cache = readCache(cachePath);
  if (!cache?.checkedAt) return true;
  return now.getTime() - new Date(cache.checkedAt).getTime() >= intervalMs;
}

async function fetchLatestFromNpm(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch('https://registry.npmjs.org/mcpfold/latest', {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return typeof data.version === 'string' ? data.version : null;
  } catch {
    return null;
  }
}
