import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OsContext } from '@mcpfold/adapters';
import { runGuided, scriptedPrompter } from '../src/onboarding/guided.js';

// A canonical config with a hardcoded token (a footgun doctor flags) + a cursor profile to fold.
const CONFIG_WITH_FOOTGUN = `{
  "version": 1,
  "servers": {
    "gh": { "transport": "stdio", "command": "npx", "args": ["-y", "srv"], "env": { "GITHUB_TOKEN": "ghp_hardcodedsecretvalue123" }, "tags": ["code"] }
  },
  "profiles": { "cursor-user": { "client": "cursor", "scope": "user", "include": ["code"] } }
}`;

let cwd: string;
let home: string;
let ctx: OsContext;
let configPath: string;
const cursorFile = () => join(home, '.cursor', 'mcp.json');

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'mcpfold-guided-cwd-'));
  home = mkdtempSync(join(tmpdir(), 'mcpfold-guided-home-'));
  configPath = join(cwd, 'mcp.config.jsonc');
  ctx = { platform: 'linux', home, env: {} };
});
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

describe('runGuided (S10.3)', () => {
  it('keeps the config, fixes a footgun, syncs, and prints savings', async () => {
    writeFileSync(configPath, CONFIG_WITH_FOOTGUN);
    const writes: string[] = [];
    // prompts: keep existing? → yes; apply fixes? → yes; sync now? → yes
    const result = await runGuided(
      { cwd, osContext: ctx },
      { prompt: scriptedPrompter([true, true, true]), write: (l) => writes.push(l) },
    );

    expect(result.aborted).toBe(false);
    expect(result.fixesApplied.length).toBeGreaterThan(0);
    // The hardcoded token was rewritten to a reference.
    const after = readFileSync(configPath, 'utf8');
    expect(after).not.toContain('ghp_hardcodedsecretvalue123');
    expect(after).toContain('${env:GITHUB_TOKEN}');
    // It folded out to the client.
    expect(existsSync(cursorFile())).toBe(true);
    expect(result.synced).toBe(true);
    expect(writes.some((l) => l.includes('~80%'))).toBe(true);
  });

  it('aborts cleanly with no partial writes when overwrite is declined', async () => {
    writeFileSync(configPath, CONFIG_WITH_FOOTGUN);
    const before = readFileSync(configPath, 'utf8');
    // prompts: keep existing? → no; overwrite? → no  → abort
    const result = await runGuided(
      { cwd, osContext: ctx },
      { prompt: scriptedPrompter([false, false]), write: () => {} },
    );

    expect(result.aborted).toBe(true);
    expect(readFileSync(configPath, 'utf8')).toBe(before); // untouched
    expect(existsSync(cursorFile())).toBe(false); // nothing folded
  });

  it('--dry-run previews the whole plan without writing', async () => {
    writeFileSync(configPath, CONFIG_WITH_FOOTGUN);
    const before = readFileSync(configPath, 'utf8');
    // prompts: keep? → yes; sync? → yes (fix step is skipped in dry-run)
    const result = await runGuided(
      { cwd, osContext: ctx, dryRun: true },
      { prompt: scriptedPrompter([true, true]), write: () => {} },
    );

    expect(result.synced).toBe(false);
    expect(result.fixesApplied).toHaveLength(0);
    expect(readFileSync(configPath, 'utf8')).toBe(before); // no fix written
    expect(existsSync(cursorFile())).toBe(false); // no client written
  });

  it('imports detected client configs non-interactively (defaults)', async () => {
    // A detected Cursor config (no canonical yet) to adopt.
    mkdirSync(join(home, '.cursor'), { recursive: true });
    writeFileSync(
      cursorFile(),
      JSON.stringify({ mcpServers: { playwright: { command: 'npx', args: ['-y', 'pw'] } } }),
    );
    const writes: string[] = [];
    // No existing config → import? (default yes) → apply? (default yes) → sync? (default yes)
    const result = await runGuided(
      { cwd, osContext: ctx },
      { prompt: scriptedPrompter([]), write: (l) => writes.push(l) },
    );

    expect(result.imported).toBe(true);
    expect(existsSync(configPath)).toBe(true);
    expect(readFileSync(configPath, 'utf8')).toContain('playwright');
    expect(result.synced).toBe(true);
  });
});
