import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CLI_VERSION } from '../src/version.js';
import { getUpdateNotice } from '../src/update-notifier.js';

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgVersion = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')).version as string;

/**
 * S16.1 — the shipped binary must report the real published version. A drifting version.ts makes
 * `--version` wrong, telemetry useless, and the update notifier nag on every run.
 */
describe('CLI version wiring (S16.1)', () => {
  let dir: string;
  let cachePath: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mcpfold-version-'));
    cachePath = join(dir, 'update-check.json');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('embedded CLI_VERSION equals packages/cli/package.json version', () => {
    expect(CLI_VERSION).toBe(pkgVersion);
  });

  it('CLI_VERSION is a real semver, never the 0.0.0 placeholder', () => {
    expect(CLI_VERSION).not.toBe('0.0.0');
    expect(CLI_VERSION).toMatch(/^\d+\.\d+\.\d+(?:[-+].+)?$/);
  });

  it('the built binary --version reports the package.json version', () => {
    const bin = join(pkgRoot, 'dist', 'bin.js');
    if (!existsSync(bin)) {
      // dist not built in this run; the parity assertion above still guards drift.
      return;
    }
    const out = execFileSync(process.execPath, [bin, '--version'], {
      encoding: 'utf8',
      env: { ...process.env, CI: 'true' }, // suppress the update notifier in the output
    }).trim();
    expect(out).toBe(pkgVersion);
  });

  it('update notifier is silent when the running version equals the latest published version', () => {
    // A cache advertising the SAME version we run — the exact real-world up-to-date case.
    writeFileSync(cachePath, JSON.stringify({ latest: CLI_VERSION, checkedAt: new Date().toISOString() }));
    const notice = getUpdateNotice({
      currentVersion: CLI_VERSION,
      env: {}, // notifier-enabled path
      isTTY: true,
      cachePath,
    });
    expect(notice).toBeNull();
  });

  it('update notifier DOES surface a notice when a strictly newer version is published', () => {
    const [maj, min, patch] = CLI_VERSION.split('.').map((n) => parseInt(n, 10));
    const newer = `${maj}.${min}.${(patch || 0) + 1}`;
    writeFileSync(cachePath, JSON.stringify({ latest: newer, checkedAt: new Date().toISOString() }));
    const notice = getUpdateNotice({ currentVersion: CLI_VERSION, env: {}, isTTY: true, cachePath });
    expect(notice).toContain(newer);
  });
});
