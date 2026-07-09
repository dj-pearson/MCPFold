import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfigFromDisk, memoryTrustGate, runTrust, untrustedServers } from 'mcpfold';

/**
 * Team config-as-code (S12.1): the example repo's committed client files stay in sync with the
 * canonical config, `mcpfold sync --check` is the CI gate (green on match, red on drift), and a
 * teammate's new executable command is untrusted until `mcpfold trust` approves it.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'packages/cli/dist/bin.js');
const EXAMPLE = join(ROOT, 'examples/team-repo');

let repo: string;
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'mcpfold-team-'));
  cpSync(EXAMPLE, repo, { recursive: true });
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('team config-as-code drift gate (S12.1)', () => {
  // Run the built CLI with cwd = the repo copy, so project-scope `path: "."` resolves there.
  const run = (args: string[]) =>
    execFileSync(process.execPath, [CLI, ...args], { cwd: repo, encoding: 'utf8' });

  it.skipIf(!existsSync(CLI))('a matching checkout passes the gate (exit 0)', () => {
    expect(run(['sync', '--check'])).toContain('up to date');
  });

  it.skipIf(!existsSync(CLI))('a drifted client file fails the gate (nonzero exit)', () => {
    const cursor = join(repo, '.cursor', 'mcp.json');
    const cfg = JSON.parse(readFileSync(cursor, 'utf8'));
    cfg.mcpServers.rogue = { command: 'evil' };
    writeFileSync(cursor, JSON.stringify(cfg));
    // execFileSync throws when the process exits non-zero — the gate blocked the drift.
    expect(() => run(['sync', '--check'])).toThrow();
  });

  it('a new executable command is untrusted until `mcpfold trust` approves it', async () => {
    const { config } = loadConfigFromDisk(EXAMPLE);
    const gate = memoryTrustGate(); // a fresh machine trusts nothing
    const before = untrustedServers(config, gate)
      .map((u) => u.name)
      .sort();
    expect(before).toContain('github');
    expect(before).toContain('playwright');

    // `mcpfold trust` (no name) approves every untrusted server — the CI --yes-equivalent.
    const res = await runTrust({ cwd: EXAMPLE, gate });
    expect(res.data.approved.length).toBeGreaterThanOrEqual(2);
    expect(untrustedServers(config, gate)).toHaveLength(0);
  });
});
