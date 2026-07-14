import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OsContext } from '@mcpfold/adapters';
import { runDoctorFix } from '../src/commands/doctor-fix.js';
import { runDoctor } from '../src/commands/doctor.js';
import { runSync } from '../src/commands/sync.js';
import { listBackups } from '../src/io/backup.js';
import { EXIT } from '../src/output/exit-codes.js';

/**
 * S25.2 — `mcpfold doctor --fix`. Drives the repair engine end-to-end against planted client files:
 * dry-run writes nothing, `--yes` applies + backs up + re-validates, scoping selects a single finding,
 * guided fixes are reported but never auto-applied, and a fix that sync refuses is reported failed
 * without a partial write.
 */

let cwd: string;
let home: string;
let ctx: OsContext;
const NOW = new Date('2026-07-13T12:00:00Z');
const never = async () => false;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'mcpfold-dfix-'));
  home = mkdtempSync(join(tmpdir(), 'mcpfold-dfixhome-'));
  ctx = { platform: 'linux', home, env: {} };
});
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

const write = (text: string) => writeFileSync(join(cwd, 'mcp.config.jsonc'), text);

/** A canonical config with one VS Code profile whose on-disk file uses the wrong root key. */
function plantVscodeRootKeyTrap(): string {
  write(`{
    "version": 1,
    "servers": { "s": { "transport": "streamable-http", "url": "https://x/mcp", "tags": ["t"] } },
    "profiles": { "vs": { "client": "vscode", "scope": "user", "include": ["t"] } }
  }`);
  const vscodeDir = join(home, '.config', 'Code', 'User');
  mkdirSync(vscodeDir, { recursive: true });
  const clientPath = join(vscodeDir, 'mcp.json');
  // Wrong root key: VS Code needs "servers", this has "mcpServers".
  writeFileSync(clientPath, '{"mcpServers":{"s":{"url":"https://x/mcp"}}}');
  return clientPath;
}

describe('runDoctorFix (S25.2)', () => {
  it('previews without writing when there is no --yes / no confirmation (dry run)', async () => {
    const clientPath = plantVscodeRootKeyTrap();
    const original = readFileSync(clientPath, 'utf8');

    const res = await runDoctorFix({ cwd, osContext: ctx, confirm: never });

    expect(res.data.previewed).toBe(true);
    expect(res.data.applied).toEqual([]);
    expect(res.data.fixable.some((f) => f.kind === 'resync-client' && f.mode === 'auto')).toBe(
      true,
    );
    // Nothing on disk changed, and no backup was taken.
    expect(readFileSync(clientPath, 'utf8')).toBe(original);
    expect(listBackups(clientPath)).toEqual([]);
    // The unfixed error is still counted, so the exit code is nonzero.
    expect(res.exit).toBe(EXIT.ERROR);
  });

  it('--dry-run forces preview even with yes=true', async () => {
    const clientPath = plantVscodeRootKeyTrap();
    const original = readFileSync(clientPath, 'utf8');
    const res = await runDoctorFix({ cwd, osContext: ctx, yes: true, dryRun: true });
    expect(res.data.previewed).toBe(true);
    expect(readFileSync(clientPath, 'utf8')).toBe(original);
  });

  it('applies with --yes: re-folds the client, backs up, and clears the finding', async () => {
    const clientPath = plantVscodeRootKeyTrap();

    const res = await runDoctorFix({ cwd, osContext: ctx, yes: true, now: NOW });

    expect(res.data.previewed).toBe(false);
    expect(res.data.applied).toHaveLength(1);
    expect(res.data.applied[0]).toMatchObject({ kind: 'resync-client', target: 'vs' });
    expect(res.data.failed).toEqual([]);
    expect(res.data.remainingErrors).toBe(0);
    expect(res.exit).toBe(EXIT.SUCCESS);

    // The file now carries VS Code's correct "servers" root key (the re-fold matches `mcpfold sync`,
    // proven byte-for-byte below), which resolves the trap; a backup of the bad file exists.
    const fixed = JSON.parse(readFileSync(clientPath, 'utf8')) as Record<string, unknown>;
    expect('servers' in fixed).toBe(true);
    expect(res.data.applied[0]!.backup).toBeTruthy();
    expect(listBackups(clientPath)).toHaveLength(1);

    // Re-running doctor is clean — the fix genuinely resolved the finding.
    expect(runDoctor({ cwd, osContext: ctx }).data.errorCount).toBe(0);
  });

  it('the repaired file is byte-identical to a plain `mcpfold sync`', async () => {
    const clientPath = plantVscodeRootKeyTrap();
    await runDoctorFix({ cwd, osContext: ctx, yes: true, now: NOW });
    const viaFix = readFileSync(clientPath, 'utf8');

    // Reset and sync straight from canonical.
    writeFileSync(clientPath, '{"mcpServers":{"s":{"url":"https://x/mcp"}}}');
    await runSync({ cwd, profile: 'vs', osContext: ctx, now: NOW });
    expect(readFileSync(clientPath, 'utf8')).toBe(viaFix);
  });

  it('scopes to specific ids and rejects unknown ids', async () => {
    // Two independent auto fixes: a VS Code root-key trap (vs) and an unpinned mcp-remote bridge (ws).
    write(`{
      "version": 1,
      "servers": {
        "s": { "transport": "streamable-http", "url": "https://x/mcp", "tags": ["t"] },
        "gh": { "transport": "streamable-http", "url": "https://y/mcp", "auth": { "type": "bearer", "token": "\${env:T}" }, "tags": ["t"] }
      },
      "profiles": {
        "vs": { "client": "vscode", "scope": "user", "include": ["t"] },
        "ws": { "client": "windsurf", "scope": "user", "include": ["t"] }
      }
    }`);
    const vscodeDir = join(home, '.config', 'Code', 'User');
    mkdirSync(vscodeDir, { recursive: true });
    writeFileSync(join(vscodeDir, 'mcp.json'), '{"mcpServers":{"s":{"url":"https://x/mcp"}}}');
    const wsDir = join(home, '.codeium', 'windsurf');
    mkdirSync(wsDir, { recursive: true });
    writeFileSync(
      join(wsDir, 'mcp_config.json'),
      JSON.stringify({
        mcpServers: { gh: { command: 'npx', args: ['-y', 'mcp-remote', 'https://y/mcp'] } },
      }),
    );

    const all = await runDoctorFix({ cwd, osContext: ctx, confirm: never });
    const autoIds = all.data.fixable.filter((f) => f.mode === 'auto').map((f) => f.id);
    expect(autoIds.length).toBe(2);

    // Apply only the first auto id — exactly one profile is re-folded.
    const scoped = await runDoctorFix({
      cwd,
      osContext: ctx,
      ids: [autoIds[0]!],
      yes: true,
      now: NOW,
    });
    expect(scoped.data.applied).toHaveLength(1);
    expect(scoped.data.applied[0]!.ids).toEqual([autoIds[0]]);

    // An unknown id is a loud usage error.
    await expect(runDoctorFix({ cwd, osContext: ctx, ids: [99], yes: true })).rejects.toThrow(
      /No fixable finding with id 99/,
    );
  });

  it('reports a hardcoded-secret fix as guided (skipped), never auto-applying it', async () => {
    write(`{
      "version": 1,
      "servers": { "s": { "transport": "stdio", "command": "x", "env": { "API_TOKEN": "ghp_hardcoded123" }, "tags": ["t"] } },
      "profiles": { "cursor": { "client": "cursor", "scope": "user", "include": ["t"] } }
    }`);
    const configBefore = readFileSync(join(cwd, 'mcp.config.jsonc'), 'utf8');

    const res = await runDoctorFix({ cwd, osContext: ctx, yes: true, now: NOW });
    expect(res.data.skipped.some((s) => s.kind === 'extract-secret')).toBe(true);
    expect(res.data.applied.some((a) => a.kind === 'extract-secret')).toBe(false);
    // The guided fix touched nothing — the hardcoded value stays until the user runs the guided flow.
    expect(readFileSync(join(cwd, 'mcp.config.jsonc'), 'utf8')).toBe(configBefore);
    expect(res.data.remainingErrors).toBeGreaterThan(0);
  });

  it('reports a fix as failed (no partial write) when sync refuses it', async () => {
    const clientPath = plantVscodeRootKeyTrap();
    const original = readFileSync(clientPath, 'utf8');
    // A strict org policy that blocks the server makes runSync throw — the fix must fail, not write.
    writeFileSync(
      join(cwd, 'mcp.policy.jsonc'),
      JSON.stringify({ version: 1, mode: 'strict', deny: [{ name: 's' }] }),
    );

    const res = await runDoctorFix({ cwd, osContext: ctx, yes: true, now: NOW });
    expect(res.data.applied).toEqual([]);
    expect(res.data.failed).toHaveLength(1);
    expect(res.data.failed[0]!.kind).toBe('resync-client');
    // Nothing was written — the client file is untouched.
    expect(readFileSync(clientPath, 'utf8')).toBe(original);
    expect(existsSync(clientPath)).toBe(true);
  });

  it('never echoes a secret value in its output (AC5)', async () => {
    write(`{
      "version": 1,
      "servers": { "s": { "transport": "stdio", "command": "x", "env": { "API_TOKEN": "ghp_SUPERSECRETVALUE" }, "tags": ["t"] } },
      "profiles": { "cursor": { "client": "cursor", "scope": "user", "include": ["t"] } }
    }`);
    const res = await runDoctorFix({ cwd, osContext: ctx, confirm: never });
    expect(res.human).not.toContain('ghp_SUPERSECRETVALUE');
    expect(JSON.stringify(res.data)).not.toContain('ghp_SUPERSECRETVALUE');
  });

  it('a clean config reports nothing to fix and exits 0', async () => {
    write(`{
      "version": 1,
      "servers": { "pw": { "transport": "stdio", "command": "npx", "args": ["-y", "@playwright/mcp@1.4.2"], "tools": { "mode": "allow", "list": ["browser_click"] }, "tags": ["code"] } },
      "profiles": { "cursor": { "client": "cursor", "scope": "user", "include": ["code"] } }
    }`);
    const res = await runDoctorFix({ cwd, osContext: ctx, yes: true });
    expect(res.data.fixable).toEqual([]);
    expect(res.data.applied).toEqual([]);
    expect(res.data.previewed).toBe(true);
    expect(res.exit).toBe(EXIT.SUCCESS);
  });
});
