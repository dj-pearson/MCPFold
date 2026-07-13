import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '@mcpfold/core';
import { vscodeAdapter, type OsContext } from '@mcpfold/adapters';
import { runDoctor, runDoctorFix, runSecretExtract, runSync } from 'mcpfold';

/**
 * S25.6 — cross-OS end-to-end gate for the diagnose → repair loop. One fixture reproduces all three
 * footguns (the VS Code root-key trap, an unpinned @latest package, a hardcoded token); the test drives
 * the real assistance commands and asserts the outcome re-validates, is byte-stable, and leaks no secret
 * value — on Windows, macOS, and Linux (this suite runs on the full CI matrix). Any regression in the
 * chain fails the build.
 */

const SECRET = 'ghp_E2E_HARDCODED_SECRET_9999';
let cwd: string;
let home: string;
let ctx: OsContext;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'mcpfold-e2e-assist-cwd-'));
  home = mkdtempSync(join(tmpdir(), 'mcpfold-e2e-assist-home-'));
  ctx = {
    platform: process.platform,
    home,
    env: { APPDATA: join(home, 'AppData', 'Roaming'), XDG_CONFIG_HOME: join(home, '.config') },
  };
});
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

const configPath = () => join(cwd, 'mcp.config.jsonc');

describe('config assistance: diagnose → repair, end to end (S25.6)', () => {
  it('repairs the three footguns to a valid, byte-stable, secret-free config', async () => {
    // A single server carrying BOTH an unpinned @latest and a hardcoded token, folded to a VS Code
    // profile whose on-disk file uses the wrong root key.
    const config = {
      version: 1,
      servers: {
        gh: {
          transport: 'stdio',
          command: 'npx',
          args: ['-y', '@acme/mcp@latest'],
          env: { API_TOKEN: SECRET },
          tags: ['work'],
        },
      },
      profiles: { vs: { client: 'vscode', scope: 'user', include: ['work'] } },
    };
    writeFileSync(configPath(), JSON.stringify(config, null, 2));

    // Plant the VS Code root-key trap: the on-disk file uses "mcpServers" instead of "servers".
    const vscodePath = vscodeAdapter.resolvePath('user', undefined, ctx);
    mkdirSync(dirname(vscodePath), { recursive: true });
    writeFileSync(vscodePath, JSON.stringify({ mcpServers: { gh: { command: 'npx' } } }));

    // 1. DIAGNOSE — doctor sees all three footguns.
    const before = runDoctor({ cwd, osContext: ctx });
    expect(before.data.findings.some((f) => f.where?.includes('API_TOKEN'))).toBe(true); // hardcoded
    expect(before.data.findings.some((f) => f.message.includes('@latest'))).toBe(true); // unpinned
    expect(before.data.findings.some((f) => f.message.includes('mcpServers'))).toBe(true); // root-key trap
    expect(before.data.errorCount).toBeGreaterThanOrEqual(2);

    // 2. REPAIR (guided) — move the hardcoded token into a dotenv reference.
    const extract = await runSecretExtract({ cwd, server: 'gh', scheme: 'dotenv', osContext: ctx });
    expect(extract.data.wrote).toBe(true);
    expect(extract.human).not.toContain(SECRET);

    // 3. REPAIR (auto) — doctor --fix re-folds the VS Code client from canonical.
    const fix = await runDoctorFix({ cwd, osContext: ctx, yes: true });
    expect(fix.data.applied.some((a) => a.kind === 'resync-client')).toBe(true);
    expect(fix.data.failed).toEqual([]);

    // 4. The only remaining finding is the advisory @latest warning (no deterministic autofix). The user
    //    supplies a concrete pin to clear it — the one repair mcpfold won't guess.
    const midErrors = runDoctor({ cwd, osContext: ctx }).data.errorCount;
    expect(midErrors).toBe(0); // both errors resolved; @latest is a warning only
    const pinned = JSON.parse(readFileSync(configPath(), 'utf8')) as typeof config;
    pinned.servers.gh.args = ['-y', '@acme/mcp@1.0.0'];
    writeFileSync(configPath(), JSON.stringify(pinned, null, 2));

    // 5. VERIFY — the canonical config re-validates and doctor is fully clean.
    const finalText = readFileSync(configPath(), 'utf8');
    expect(loadConfig(finalText).ok).toBe(true);
    expect(runDoctor({ cwd, osContext: ctx }).data.errorCount).toBe(0);

    // No raw secret value survives anywhere on disk — not the canonical config, not the folded client.
    await runSync({ cwd, osContext: ctx });
    expect(finalText).not.toContain(SECRET);
    expect(readFileSync(vscodePath, 'utf8')).not.toContain(SECRET);

    // Byte-stable + OS-independent: the canonical config carries no absolute/home paths, and re-running
    // the repair commands is a no-op (idempotent) — so the repaired file is identical across the matrix.
    expect(finalText).not.toContain(home);
    const extractAgain = await runSecretExtract({
      cwd,
      server: 'gh',
      scheme: 'dotenv',
      osContext: ctx,
    });
    expect(extractAgain.data.extracted).toEqual([]); // nothing left to extract
    await runDoctorFix({ cwd, osContext: ctx, yes: true });
    expect(readFileSync(configPath(), 'utf8')).toBe(finalText); // byte-identical after a repeat pass
  });
});
