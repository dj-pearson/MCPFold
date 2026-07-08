import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OsContext } from '@mcpfold/adapters';
import { runSync } from '../src/commands/sync.js';
import { runRestore } from '../src/commands/restore.js';
import { listBackups } from '../src/io/backup.js';

const config = (servers: string[]) => `{
  "version": 1,
  "servers": {
    ${servers.map((s) => `"${s}": { "transport": "stdio", "command": "npx", "args": ["-y", "${s}"], "pin": "1.0.0", "tags": ["code"] }`).join(',\n    ')}
  },
  "profiles": { "cursor-user": { "client": "cursor", "scope": "user", "include": ["code"] } }
}`;

let cwd: string;
let home: string;
let ctx: OsContext;
const cursorFile = () => join(home, '.cursor', 'mcp.json');
const cfgPath = () => join(cwd, 'mcp.config.jsonc');

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'mcpfold-restore-cwd-'));
  home = mkdtempSync(join(tmpdir(), 'mcpfold-restore-home-'));
  ctx = { platform: 'linux', home, env: {} };
});
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

describe('runRestore (S10.5)', () => {
  it('restores the prior contents after a bad sync', async () => {
    writeFileSync(cfgPath(), config(['a']));
    await runSync({ cwd, osContext: ctx, now: new Date('2026-07-08T01:00:00Z') });
    const v1 = readFileSync(cursorFile(), 'utf8');

    writeFileSync(cfgPath(), config(['a', 'b'])); // "bad" change
    await runSync({ cwd, osContext: ctx, now: new Date('2026-07-08T02:00:00Z') }); // backs up v1
    expect(readFileSync(cursorFile(), 'utf8')).not.toBe(v1);

    const out = runRestore({
      cwd,
      profile: 'cursor-user',
      osContext: ctx,
      now: new Date('2026-07-08T03:00:00Z'),
    });
    expect(out.data.restored?.dryRun).toBe(false);
    expect(readFileSync(cursorFile(), 'utf8')).toBe(v1); // rolled back exactly
  });

  it('selects the latest by default and a specific backup with --at', async () => {
    writeFileSync(cfgPath(), config(['a']));
    await runSync({ cwd, osContext: ctx, now: new Date('2026-07-08T01:00:00Z') });
    const v1 = readFileSync(cursorFile(), 'utf8');
    writeFileSync(cfgPath(), config(['a', 'b']));
    await runSync({ cwd, osContext: ctx, now: new Date('2026-07-08T02:00:00Z') }); // backup holds v1
    const v2 = readFileSync(cursorFile(), 'utf8');
    writeFileSync(cfgPath(), config(['a', 'b', 'c']));
    await runSync({ cwd, osContext: ctx, now: new Date('2026-07-08T03:00:00Z') }); // backup holds v2

    const backups = listBackups(cursorFile()); // newest first: [v2-backup, v1-backup]
    expect(backups.length).toBe(2);

    // Latest → v2.
    runRestore({
      cwd,
      profile: 'cursor-user',
      osContext: ctx,
      now: new Date('2026-07-08T04:00:00Z'),
    });
    expect(readFileSync(cursorFile(), 'utf8')).toBe(v2);

    // Chosen (oldest backup) → v1.
    const oldest = backups[backups.length - 1]!.timestamp;
    runRestore({
      cwd,
      profile: 'cursor-user',
      at: oldest,
      osContext: ctx,
      now: new Date('2026-07-08T05:00:00Z'),
    });
    expect(readFileSync(cursorFile(), 'utf8')).toBe(v1);
  });

  it('errors clearly when there is no backup to restore', async () => {
    writeFileSync(cfgPath(), config(['a']));
    await runSync({ cwd, osContext: ctx }); // first sync makes no backup (file was absent)
    expect(() => runRestore({ cwd, profile: 'cursor-user', osContext: ctx })).toThrow(/No backups/);
  });

  it('--dry-run reports the plan but writes nothing', async () => {
    writeFileSync(cfgPath(), config(['a']));
    await runSync({ cwd, osContext: ctx, now: new Date('2026-07-08T01:00:00Z') });
    writeFileSync(cfgPath(), config(['a', 'b']));
    await runSync({ cwd, osContext: ctx, now: new Date('2026-07-08T02:00:00Z') });
    const current = readFileSync(cursorFile(), 'utf8');

    const out = runRestore({ cwd, profile: 'cursor-user', dryRun: true, osContext: ctx });
    expect(out.data.restored?.dryRun).toBe(true);
    expect(readFileSync(cursorFile(), 'utf8')).toBe(current); // untouched
  });

  it('lists backups per profile without restoring', async () => {
    writeFileSync(cfgPath(), config(['a']));
    await runSync({ cwd, osContext: ctx, now: new Date('2026-07-08T01:00:00Z') });
    writeFileSync(cfgPath(), config(['a', 'b']));
    await runSync({ cwd, osContext: ctx, now: new Date('2026-07-08T02:00:00Z') });

    const out = runRestore({ cwd, list: true, osContext: ctx });
    const target = out.data.targets.find((t) => t.profile === 'cursor-user');
    expect(target?.backups.length).toBe(1);
    expect(out.data.restored).toBeUndefined();
  });
});
