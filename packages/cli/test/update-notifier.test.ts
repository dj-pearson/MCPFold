import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  detectChannel,
  getUpdateNotice,
  isNewer,
  isNotifierEnabled,
  refreshUpdateCache,
  upgradeCommand,
} from '../src/update-notifier.js';

let dir: string;
let cachePath: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mcpfold-notifier-'));
  cachePath = join(dir, 'update-check.json');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const writeCache = (latest: string, checkedAt = new Date().toISOString()) =>
  writeFileSync(cachePath, JSON.stringify({ latest, checkedAt }));

describe('isNotifierEnabled (S11.3)', () => {
  it('is on in a TTY with no CI/opt-out, off otherwise', () => {
    expect(isNotifierEnabled({}, true)).toBe(true);
    expect(isNotifierEnabled({}, false)).toBe(false); // non-TTY
    expect(isNotifierEnabled({ CI: 'true' }, true)).toBe(false); // CI
    expect(isNotifierEnabled({ DO_NOT_TRACK: '1' }, true)).toBe(false); // telemetry convention
    expect(isNotifierEnabled({ MCPFOLD_NO_UPDATE_NOTIFIER: '1' }, true)).toBe(false); // opt-out
  });
});

describe('channel detection + upgrade command (S11.3)', () => {
  it('maps install paths to channels and commands', () => {
    expect(detectChannel('/opt/homebrew/Cellar/mcpfold/1.0/bin/node')).toBe('homebrew');
    expect(detectChannel('C:/Users/x/scoop/apps/mcpfold/current/mcpfold.exe')).toBe('scoop');
    expect(detectChannel('/usr/local/bin/mcpfold')).toBe('binary');
    expect(detectChannel('/usr/bin/node')).toBe('npm');
    expect(upgradeCommand('homebrew')).toBe('brew upgrade mcpfold');
    expect(upgradeCommand('npm')).toContain('npm install -g mcpfold');
    expect(upgradeCommand('binary')).toContain('install.sh');
  });
});

describe('isNewer (S11.3)', () => {
  it('compares semver numerically, ignoring pre-release tags', () => {
    expect(isNewer('1.2.0', '1.1.9')).toBe(true);
    expect(isNewer('1.0.0', '1.0.0')).toBe(false);
    expect(isNewer('0.9.0', '1.0.0')).toBe(false);
    expect(isNewer('2.0.0-beta.1', '1.9.9')).toBe(true);
  });
});

describe('getUpdateNotice (S11.3)', () => {
  const base = {
    currentVersion: '1.0.0',
    env: {},
    isTTY: true,
    execPath: '/usr/bin/node',
  } as const;

  it('returns a channel-correct notice when a newer version is cached', () => {
    writeCache('1.2.0');
    const notice = getUpdateNotice({ ...base, cachePath });
    expect(notice).toContain('1.0.0 → 1.2.0');
    expect(notice).toContain('npm install -g mcpfold');
  });

  it('is silent when up to date, when disabled, and when there is no cache', () => {
    writeCache('1.0.0');
    expect(getUpdateNotice({ ...base, cachePath })).toBeNull(); // up to date
    writeCache('2.0.0');
    expect(getUpdateNotice({ ...base, cachePath, isTTY: false })).toBeNull(); // disabled
    expect(getUpdateNotice({ ...base, cachePath: join(dir, 'none.json') })).toBeNull(); // no cache
  });
});

describe('refreshUpdateCache (S11.3)', () => {
  it('writes the fetched version to the cache', async () => {
    await refreshUpdateCache({ cachePath, fetchLatest: () => Promise.resolve('3.4.5') });
    expect(JSON.parse(readFileSync(cachePath, 'utf8')).latest).toBe('3.4.5');
  });

  it('is silent (no write) when the registry is unreachable', async () => {
    await refreshUpdateCache({ cachePath, fetchLatest: () => Promise.resolve(null) });
    expect(existsSync(cachePath)).toBe(false);
  });

  it('skips the fetch when the cache is still fresh', async () => {
    writeCache('1.0.0', new Date('2026-07-08T00:00:00Z').toISOString());
    let called = false;
    await refreshUpdateCache({
      cachePath,
      now: () => new Date('2026-07-08T01:00:00Z'), // 1h later, within 24h
      fetchLatest: () => {
        called = true;
        return Promise.resolve('9.9.9');
      },
    });
    expect(called).toBe(false);
    expect(JSON.parse(readFileSync(cachePath, 'utf8')).latest).toBe('1.0.0'); // untouched
  });
});
