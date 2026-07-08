import { Buffer } from 'node:buffer';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OsContext } from '@mcpfold/adapters';
import { runStatus } from '../src/commands/status.js';
import { runSync } from '../src/commands/sync.js';
import { inMemoryBackend, saveSession } from '../src/cloud/token-store.js';
import { EXIT } from '../src/output/exit-codes.js';

// Pinned so `doctor` finds no unpinned-@latest warning (a clean baseline).
const CONFIG = `{
  "version": 1,
  "servers": {
    "playwright": { "transport": "stdio", "command": "npx", "args": ["-y", "@playwright/mcp@latest"], "pin": "1.4.2", "tags": ["code"] }
  },
  "profiles": { "cursor-user": { "client": "cursor", "scope": "user", "include": ["code"] } }
}`;

const jwtFor = (sub: string): string =>
  `h.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.s`;

let cwd: string;
let home: string;
let ctx: OsContext;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'mcpfold-status-cwd-'));
  home = mkdtempSync(join(tmpdir(), 'mcpfold-status-home-'));
  writeFileSync(join(cwd, 'mcp.config.jsonc'), CONFIG);
  ctx = { platform: 'linux', home, env: {} };
});
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

describe('runStatus (S10.1)', () => {
  it('clean, synced state → in-sync, no findings, exit 0, cloud hidden when logged out', async () => {
    await runSync({ cwd, osContext: ctx });
    const backend = inMemoryBackend();
    const result = await runStatus({ cwd, osContext: ctx, backend });
    expect(result.exit).toBe(EXIT.SUCCESS);
    expect(result.data.ok).toBe(true);
    expect(result.data.health).toEqual({ errors: 0, warnings: 0 });
    expect(result.data.clients.find((c) => c.client === 'cursor')?.inSync).toBe(true);
    expect(result.data.cloud).toBeNull();
    expect(result.human).toContain('Everything looks good');
  });

  it('a mutated client file → drift shown, exit 1', async () => {
    await runSync({ cwd, osContext: ctx });
    mkdirSync(join(home, '.cursor'), { recursive: true });
    writeFileSync(
      join(home, '.cursor', 'mcp.json'),
      JSON.stringify({
        mcpServers: { playwright: { command: 'npx' }, rogue: { command: 'evil' } },
      }),
    );
    const result = await runStatus({ cwd, osContext: ctx, backend: inMemoryBackend() });
    expect(result.exit).toBe(EXIT.DIFF);
    expect(result.data.ok).toBe(false);
    const cursor = result.data.clients.find((c) => c.client === 'cursor');
    expect(cursor?.inSync).toBe(false);
    expect(cursor?.unmanaged).toBeGreaterThanOrEqual(1);
  });

  it('shows the cloud section (identity + endpoint) when logged in', async () => {
    await runSync({ cwd, osContext: ctx });
    const backend = inMemoryBackend();
    await saveSession(
      {
        accessToken: jwtFor('dev@mcpfold.com'),
        refreshToken: 'r',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        endpoint: 'https://api.test',
      },
      backend,
    );
    const result = await runStatus({ cwd, osContext: ctx, backend });
    expect(result.data.cloud).toEqual({
      loggedIn: true,
      endpoint: 'https://api.test',
      identity: 'dev@mcpfold.com',
    });
    expect(result.human).toContain('logged in as dev@mcpfold.com');
  });

  it('has a stable --json data shape', async () => {
    await runSync({ cwd, osContext: ctx });
    const result = await runStatus({ cwd, osContext: ctx, backend: inMemoryBackend() });
    expect(Object.keys(result.data).sort()).toEqual(['clients', 'cloud', 'health', 'ok']);
    const client = result.data.clients[0]!;
    expect(Object.keys(client).sort()).toEqual(
      [
        'added',
        'changed',
        'client',
        'inSync',
        'managed',
        'needsRestart',
        'path',
        'profile',
        'unmanaged',
      ].sort(),
    );
  });
});
