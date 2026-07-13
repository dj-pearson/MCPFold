import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UsageError } from '@mcpfold/core';
import { estimateToolTokens, loadConfig } from '@mcpfold/core';
import { runCuratePick } from '../src/commands/curate.js';
import { writeSnapshot } from '../src/discover/cache.js';

/**
 * Day-zero curation (S24.7): a brand-new user with no audit history reaches an applied allow-list by
 * picking from the DISCOVERED surface — `--tools` non-interactively or an interactive multi-select.
 */

const TOOLS = ['search_code', 'create_pr', 'delete_repo'].map((n) => ({
  name: n,
  description: `tool ${n}`,
  inputSchema: { type: 'object' },
}));

// A config with a comment, to prove the jsonc edit preserves it.
const CONFIG = `{
  // my servers
  "version": 1,
  "servers": {
    "github": { "transport": "stdio", "command": "gh", "tags": ["code"] }
  },
  "profiles": { "c": { "client": "cursor", "scope": "user", "include": ["code"] } }
}`;

let cwd: string;
let cacheDir: string;
const configPath = () => join(cwd, 'mcp.config.jsonc');

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'mcpfold-pick-'));
  cacheDir = mkdtempSync(join(tmpdir(), 'mcpfold-pick-cache-'));
  writeFileSync(configPath(), CONFIG);
  // A discovery snapshot so the picker has a surface without spawning anything.
  writeSnapshot(
    {
      server: 'github',
      capturedAt: '2026-07-13T00:00:00.000Z',
      transport: 'stdio',
      toolCount: TOOLS.length,
      totalTokens: TOOLS.reduce((s, t) => s + estimateToolTokens(t), 0),
      tools: TOOLS.map((t) => ({ name: t.name, tokens: estimateToolTokens(t) })),
    },
    { dir: cacheDir },
  );
});
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
  rmSync(cacheDir, { recursive: true, force: true });
});

const base = () => ({ cwd, env: {} as NodeJS.ProcessEnv, cache: { dir: cacheDir } });

describe('runCuratePick — non-interactive --tools (S24.7)', () => {
  it('writes the exact allow directive and preserves comments', async () => {
    const out = await runCuratePick({ ...base(), server: 'github', tools: ['search_code', 'create_pr'] });
    expect(out.data.applied).toBe(true);
    expect(out.data.source).toBe('discovery');
    expect(out.human).toContain('keeping 2 of 3 tools'); // impact preview

    const text = readFileSync(configPath(), 'utf8');
    expect(text).toContain('// my servers'); // comment survived the jsonc edit
    const cfg = loadConfig(text);
    expect(cfg.ok && cfg.config.servers.github?.tools).toEqual({
      mode: 'allow',
      list: ['create_pr', 'search_code'], // sorted
    });
  });

  it('rejects tools that are not on the discovered surface', async () => {
    await expect(
      runCuratePick({ ...base(), server: 'github', tools: ['search_code', 'nonexistent'] }),
    ).rejects.toThrow(UsageError);
    // The config is untouched on rejection.
    expect(readFileSync(configPath(), 'utf8')).toBe(CONFIG);
  });

  it('refuses non-interactively with no --tools and no usage, naming the surface size', async () => {
    await expect(
      runCuratePick({ ...base(), server: 'github', isTTY: false }),
    ).rejects.toThrow(/no recorded usage/i);
  });
});

describe('runCuratePick — interactive picker (S24.7)', () => {
  it('selects a subset via the injected picker and round-trips through the config', async () => {
    const out = await runCuratePick({
      ...base(),
      server: 'github',
      isTTY: true,
      pick: async (_server, tools) => tools.filter((t) => t.name === 'search_code').map((t) => t.name),
      confirm: async () => true,
    });
    expect(out.data.applied).toBe(true);
    expect(out.data.selected).toEqual(['search_code']);
    const cfg = loadConfig(readFileSync(configPath(), 'utf8'));
    expect(cfg.ok && cfg.config.servers.github?.tools).toEqual({ mode: 'allow', list: ['search_code'] });
  });

  it('previews without writing when confirmation is declined', async () => {
    const out = await runCuratePick({
      ...base(),
      server: 'github',
      isTTY: true,
      pick: async (_s, tools) => tools.map((t) => t.name),
      confirm: async () => false,
    });
    expect(out.data.applied).toBe(false);
    expect(out.human).toContain('Not applied');
    expect(readFileSync(configPath(), 'utf8')).toBe(CONFIG); // untouched
  });
});

describe('runCuratePick — usage precedence (S24.7 criterion 5)', () => {
  it('reports the usage-based recommendation read-only and says it takes precedence', async () => {
    const logPath = join(cwd, 'audit.jsonl');
    writeFileSync(
      logPath,
      JSON.stringify({
        ts: '2026-07-11T00:00:00.000Z',
        server: 'github',
        type: 'tools/call',
        tool: 'search_code',
        outcome: 'ok',
      }),
    );
    const out = await runCuratePick({ ...base(), server: 'github', auditLogPath: logPath });
    expect(out.data.source).toBe('usage');
    expect(out.data.applied).toBe(false); // read-only; the bare picker never auto-writes usage-based
    expect(out.human).toContain('takes precedence');
    expect(readFileSync(configPath(), 'utf8')).toBe(CONFIG); // untouched
  });
});
