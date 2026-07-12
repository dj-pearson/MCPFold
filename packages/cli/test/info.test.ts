import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OsContext } from '@mcpfold/adapters';
import { runInfo } from '../src/commands/info.js';
import { CLI_VERSION } from '../src/version.js';

const CONFIG = `{
  "version": 1,
  "servers": {},
  "profiles": {}
}`;

let cwd: string;
let home: string;
let ctx: OsContext;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'mcpfold-info-cwd-'));
  home = mkdtempSync(join(tmpdir(), 'mcpfold-info-home-'));
  ctx = { platform: 'linux', home, env: {} };
});
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

describe('runInfo (S23.3)', () => {
  it('reports the current version and finds a config in cwd', () => {
    writeFileSync(join(cwd, 'mcp.config.jsonc'), CONFIG);
    const out = runInfo({ cwd, osContext: ctx, env: {}, isTTY: false, execPath: '/usr/bin/node' });
    expect(out.data.version).toBe(CLI_VERSION);
    expect(out.data.channel).toBe('npm');
    expect(out.data.configPath).toBe(join(cwd, 'mcp.config.jsonc'));
    expect(out.human).toContain('version');
    expect(out.human).toContain(CLI_VERSION);
  });

  it('flags a missing config without throwing', () => {
    const out = runInfo({ cwd, osContext: ctx, env: {}, isTTY: false, execPath: '/usr/bin/node' });
    expect(out.data.configPath).toBeNull();
    expect(out.human).toContain('not found');
  });

  it('reflects telemetry + notifier opt-in state from the environment', () => {
    const on = runInfo({
      cwd,
      osContext: ctx,
      env: { MCPFOLD_TELEMETRY: '1' },
      isTTY: true,
      execPath: '/usr/bin/node',
    });
    expect(on.data.telemetryEnabled).toBe(true);
    expect(on.data.updateNotifierEnabled).toBe(true);

    const off = runInfo({
      cwd,
      osContext: ctx,
      env: { DO_NOT_TRACK: '1' },
      isTTY: false,
      execPath: '/usr/bin/node',
    });
    expect(off.data.telemetryEnabled).toBe(false);
    expect(off.data.updateNotifierEnabled).toBe(false); // non-TTY
  });

  it('surfaces a cached newer version as an available update', () => {
    // Seed the update-check cache under the linux XDG config dir the notifier reads.
    const cacheDir = join(home, '.config', 'mcpfold');
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(
      join(cacheDir, 'update-check.json'),
      JSON.stringify({ latest: '999.0.0', checkedAt: '2026-01-01T00:00:00.000Z' }),
    );
    const out = runInfo({ cwd, osContext: ctx, env: {}, isTTY: false, execPath: '/usr/bin/node' });
    expect(out.data.latestKnown).toBe('999.0.0');
    expect(out.data.updateAvailable).toBe(true);
    expect(out.data.lastCheckedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(out.human).toContain('available');
  });
});
