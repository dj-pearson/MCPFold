import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OsContext } from '@mcpfold/adapters';
import { runSync } from '../src/commands/sync.js';
import { EXIT } from '../src/output/exit-codes.js';

/**
 * Integration tests for `mcpfold sync` (S3.5 + S4.6 strategy): a temp cwd holds the
 * canonical config and a temp HOME receives the rendered client files.
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
  it('writes the expected cursor file into HOME', async () => {
    const result = await runSync({ cwd, osContext: ctx });
    const target = join(home, '.cursor', 'mcp.json');
    expect(existsSync(target)).toBe(true);
    const written = JSON.parse(readFileSync(target, 'utf8'));
    expect(written.mcpServers.playwright.command).toBe('npx');
    expect(result.data.wrote).toBe(true);
    expect(result.data.results[0]?.action).toBe('written');
  });

  it('backs up an existing target before overwriting', async () => {
    const target = join(home, '.cursor', 'mcp.json');
    await runSync({ cwd, osContext: ctx });
    writeFileSync(target, '{"mcpServers":{"old":{"command":"x"}}}');
    const result = await runSync({ cwd, osContext: ctx, now: new Date('2026-07-08T00:00:00Z') });
    const backups = readdirSync(join(home, '.cursor')).filter((f) => f.includes('.mcpfold.bak.'));
    expect(backups.length).toBe(1);
    expect(result.data.results[0]?.backup).toContain('.mcpfold.bak.');
  });

  it('is idempotent — a second sync reports unchanged and writes no backup', async () => {
    await runSync({ cwd, osContext: ctx });
    const second = await runSync({ cwd, osContext: ctx });
    expect(second.data.results[0]?.action).toBe('unchanged');
    expect(second.data.wrote).toBe(false);
    const backups = readdirSync(join(home, '.cursor')).filter((f) => f.includes('.mcpfold.bak.'));
    expect(backups).toHaveLength(0);
  });

  it('--dry-run writes nothing and previews', async () => {
    const result = await runSync({ cwd, osContext: ctx, dryRun: true });
    expect(existsSync(join(home, '.cursor', 'mcp.json'))).toBe(false);
    expect(result.data.results[0]?.action).toBe('preview');
    expect(result.data.results[0]?.diff?.fileMissing).toBe(true);
  });

  it('--check exits DIFF when the target is missing/drifted, writing nothing', async () => {
    const result = await runSync({ cwd, osContext: ctx, check: true });
    expect(result.exit).toBe(EXIT.DIFF);
    expect(existsSync(join(home, '.cursor', 'mcp.json'))).toBe(false);
    await runSync({ cwd, osContext: ctx });
    expect((await runSync({ cwd, osContext: ctx, check: true })).exit).toBe(EXIT.SUCCESS);
  });

  it('leaves no temp file behind after writing', async () => {
    await runSync({ cwd, osContext: ctx });
    const stray = readdirSync(join(home, '.cursor')).filter((f) => f.includes('.mcpfold.tmp'));
    expect(stray).toHaveLength(0);
  });
});

describe('runSync reports curation-shimmed servers (S24.1)', () => {
  const CURATED_CONFIG = `{
  "version": 1,
  "servers": {
    "playwright": { "transport": "stdio", "command": "npx", "args": ["-y", "@playwright/mcp@latest"], "tags": ["code"], "tools": { "mode": "allow", "list": ["browser_navigate"] } }
  },
  "profiles": {
    "cursor-user": { "client": "cursor", "scope": "user", "include": ["code"] }
  }
}`;

  it('names the tools-directive server in data.curated and the human summary', async () => {
    writeFileSync(join(cwd, 'mcp.config.jsonc'), CURATED_CONFIG);
    const result = await runSync({ cwd, osContext: ctx });
    expect(result.data.curated).toEqual(['playwright']);
    expect(result.human).toContain('Tool curation active');
    expect(result.human).toContain('playwright');
    // The server folds to the proxy shim, not its direct command — curation only runs there.
    const written = JSON.parse(readFileSync(join(home, '.cursor', 'mcp.json'), 'utf8'));
    expect(written.mcpServers.playwright.command).toBe('mcpfold');
    expect(written.mcpServers.playwright.args.slice(0, 2)).toEqual(['run', 'playwright']);
  });

  it('omits the curation section when no server carries a tools directive', async () => {
    const result = await runSync({ cwd, osContext: ctx });
    expect(result.data.curated).toEqual([]);
    expect(result.human).not.toContain('Tool curation active');
  });
});

describe('runSync into a shared config file (S19.2)', () => {
  const GOOSE_CONFIG = `{
  "version": 1,
  "servers": {
    "playwright": { "transport": "stdio", "command": "npx", "args": ["-y", "@playwright/mcp@latest"], "tags": ["code"] }
  },
  "profiles": {
    "goose-user": { "client": "goose", "scope": "user", "include": ["code"] }
  }
}`;

  it("merges into Goose config.yaml, preserving the user's non-MCP settings", async () => {
    writeFileSync(join(cwd, 'mcp.config.jsonc'), GOOSE_CONFIG);
    const target = join(home, '.config', 'goose', 'config.yaml');
    mkdirSync(join(home, '.config', 'goose'), { recursive: true });
    writeFileSync(
      target,
      '# my goose config\nGOOSE_PROVIDER: anthropic\nextensions:\n  developer:\n    type: builtin\n    enabled: true\n',
    );

    const result = await runSync({ cwd, osContext: ctx });
    expect(result.data.wrote).toBe(true);
    const written = readFileSync(target, 'utf8');
    // The user's non-MCP setting, comment, and Goose's builtin extension all survive the fold.
    expect(written).toContain('GOOSE_PROVIDER: anthropic');
    expect(written).toContain('# my goose config');
    expect(written).toContain('developer:');
    // The folded server is present, in Goose's dialect (`cmd`, not `command`).
    expect(written).toContain('playwright:');
    expect(written).toContain('cmd: npx');
  });
});
