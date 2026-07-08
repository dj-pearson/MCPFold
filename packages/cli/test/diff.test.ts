import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OsContext } from '@mcpfold/adapters';
import { runDiff } from '../src/commands/diff.js';
import { runSync } from '../src/commands/sync.js';
import { EXIT } from '../src/output/exit-codes.js';

const CONFIG = `{
  "version": 1,
  "servers": {
    "playwright": { "transport": "stdio", "command": "npx", "args": ["-y", "@playwright/mcp@latest"], "tags": ["code"] }
  },
  "profiles": { "cursor-user": { "client": "cursor", "scope": "user", "include": ["code"] } }
}`;

let cwd: string;
let home: string;
let ctx: OsContext;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'mcpfold-cwd-'));
  home = mkdtempSync(join(tmpdir(), 'mcpfold-home-'));
  writeFileSync(join(cwd, 'mcp.config.jsonc'), CONFIG);
  ctx = { platform: 'linux', home, env: {} };
});
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

describe('runDiff (S3.6)', () => {
  it('missing target → drift with exit DIFF, reported gracefully', async () => {
    const result = await runDiff({ cwd, osContext: ctx });
    expect(result.exit).toBe(EXIT.DIFF);
    expect(result.data.drift).toBe(true);
    expect(result.data.clients[0]?.diff.fileMissing).toBe(true);
  });

  it('after sync, clean state → exit 0, no drift', async () => {
    await runSync({ cwd, osContext: ctx });
    const result = await runDiff({ cwd, osContext: ctx });
    expect(result.exit).toBe(EXIT.SUCCESS);
    expect(result.data.drift).toBe(false);
  });

  it('a modified on-disk file → exit DIFF and a shown change', async () => {
    await runSync({ cwd, osContext: ctx });
    // Tamper: add an unmanaged server on disk.
    const target = join(home, '.cursor', 'mcp.json');
    mkdirSync(join(home, '.cursor'), { recursive: true });
    writeFileSync(
      target,
      JSON.stringify({
        mcpServers: { playwright: { command: 'npx' }, rogue: { command: 'evil' } },
      }),
    );
    const result = await runDiff({ cwd, osContext: ctx });
    expect(result.exit).toBe(EXIT.DIFF);
    const serverDiffs = result.data.clients[0]?.diff.servers ?? [];
    expect(serverDiffs.find((s) => s.name === 'rogue')?.status).toBe('unmanaged');
    // playwright lost its args on disk → changed.
    expect(serverDiffs.find((s) => s.name === 'playwright')?.status).toBe('changed');
  });
});
