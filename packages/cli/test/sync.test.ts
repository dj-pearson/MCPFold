import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OsContext } from '@mcpfold/adapters';
import { runSync } from '../src/commands/sync.js';
import { EXIT } from '../src/output/exit-codes.js';

/**
 * Integration tests for `mcpfold sync` (S3.5): a temp cwd holds the canonical config and a
 * temp HOME receives the rendered client files (via an injected OsContext).
 */

const CONFIG = `{
  "version": 1,
  "servers": {
    "playwright": { "transport": "stdio", "command": "npx", "args": ["-y", "@playwright/mcp@latest"], "tags": ["code"] }
  },
  "profiles": {
    "cursor-user": { "client": "cursor", "scope": "user", "include": ["code"] }
  }
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

describe('runSync (S3.5)', () => {
  it('writes the expected cursor file into HOME', () => {
    const result = runSync({ cwd, osContext: ctx });
    const target = join(home, '.cursor', 'mcp.json');
    expect(existsSync(target)).toBe(true);
    const written = JSON.parse(readFileSync(target, 'utf8'));
    expect(written.mcpServers.playwright.command).toBe('npx');
    expect(result.data.wrote).toBe(true);
    expect(result.data.results[0]?.action).toBe('written');
  });

  it('backs up an existing target before overwriting', () => {
    const target = join(home, '.cursor', 'mcp.json');
    // Pre-seed a different file so sync must back it up.
    runSync({ cwd, osContext: ctx }); // create it
    writeFileSync(target, '{"mcpServers":{"old":{"command":"x"}}}');
    const result = runSync({ cwd, osContext: ctx, now: new Date('2026-07-08T00:00:00Z') });
    const backups = readdirSync(join(home, '.cursor')).filter((f) => f.includes('.mcpfold.bak.'));
    expect(backups.length).toBe(1);
    expect(result.data.results[0]?.backup).toContain('.mcpfold.bak.');
  });

  it('is idempotent — a second sync reports unchanged and writes no backup', () => {
    runSync({ cwd, osContext: ctx });
    const second = runSync({ cwd, osContext: ctx });
    expect(second.data.results[0]?.action).toBe('unchanged');
    expect(second.data.wrote).toBe(false);
    const backups = readdirSync(join(home, '.cursor')).filter((f) => f.includes('.mcpfold.bak.'));
    expect(backups).toHaveLength(0);
  });

  it('--dry-run writes nothing and previews', () => {
    const result = runSync({ cwd, osContext: ctx, dryRun: true });
    expect(existsSync(join(home, '.cursor', 'mcp.json'))).toBe(false);
    expect(result.data.results[0]?.action).toBe('preview');
    expect(result.data.results[0]?.diff?.fileMissing).toBe(true);
  });

  it('--check exits DIFF when the target is missing/drifted, writing nothing', () => {
    const result = runSync({ cwd, osContext: ctx, check: true });
    expect(result.exit).toBe(EXIT.DIFF);
    expect(existsSync(join(home, '.cursor', 'mcp.json'))).toBe(false);
    // After a real sync, --check is clean.
    runSync({ cwd, osContext: ctx });
    expect(runSync({ cwd, osContext: ctx, check: true }).exit).toBe(EXIT.SUCCESS);
  });

  it('leaves no temp file behind after writing', () => {
    runSync({ cwd, osContext: ctx });
    const stray = readdirSync(join(home, '.cursor')).filter((f) => f.includes('.mcpfold.tmp'));
    expect(stray).toHaveLength(0);
  });
});
