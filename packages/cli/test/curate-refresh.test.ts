import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { estimateToolTokens, loadConfig, type ToolsDirective } from '@mcpfold/core';
import { runCurateRefresh } from '../src/commands/curate.js';
import { newUpstreamTools, staleAllowlists } from '../src/discover/staleness.js';
import { writeSnapshot, type SurfaceSnapshot } from '../src/discover/cache.js';

/**
 * Allow-list staleness (S24.11): a curated server's new upstream tools produce a visible, actionable
 * signal, and `curate --refresh` never widens the allow-list without explicit consent.
 */

// The server ships 3 tools; the allow-list only knows 2 → "delete_repo" is new.
const TOOLS = ['search_code', 'create_pr', 'delete_repo'].map((n) => ({
  name: n,
  description: `tool ${n}`,
  inputSchema: { type: 'object' },
}));
const snapshot: SurfaceSnapshot = {
  server: 'github',
  capturedAt: '2026-07-13T00:00:00.000Z',
  transport: 'stdio',
  toolCount: 3,
  totalTokens: TOOLS.reduce((s, t) => s + estimateToolTokens(t), 0),
  tools: TOOLS.map((t) => ({ name: t.name, tokens: estimateToolTokens(t) })),
};

const CONFIG = `{
  "version": 1,
  "servers": {
    "github": { "transport": "stdio", "command": "gh", "tags": ["code"], "tools": { "mode": "allow", "list": ["search_code", "create_pr"] } }
  },
  "profiles": { "c": { "client": "cursor", "scope": "user", "include": ["code"] } }
}`;

describe('newUpstreamTools / staleAllowlists', () => {
  it('reports tools on the surface that an allow-list omits; deny/none report nothing', () => {
    const allow: ToolsDirective = { mode: 'allow', list: ['search_code', 'create_pr'] };
    expect(newUpstreamTools(allow, snapshot)).toEqual(['delete_repo']);
    expect(newUpstreamTools({ mode: 'deny', list: [] }, snapshot)).toEqual([]); // deny lets new tools through
    expect(newUpstreamTools(undefined, snapshot)).toEqual([]);
    expect(newUpstreamTools(allow, null)).toEqual([]);
  });
});

let cwd: string;
let cacheDir: string;
const configPath = () => join(cwd, 'mcp.config.jsonc');

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'mcpfold-refresh-'));
  cacheDir = mkdtempSync(join(tmpdir(), 'mcpfold-refresh-cache-'));
  writeFileSync(configPath(), CONFIG);
  writeSnapshot(snapshot, { dir: cacheDir });
});
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
  rmSync(cacheDir, { recursive: true, force: true });
});

describe('staleAllowlists over a config', () => {
  it('finds the affected server and its new tools', () => {
    const cfg = loadConfig(CONFIG);
    if (!cfg.ok) throw new Error('bad fixture');
    expect(staleAllowlists(cfg.config, { dir: cacheDir })).toEqual([
      { server: 'github', newTools: ['delete_repo'] },
    ]);
  });
});

describe('runCurateRefresh (S24.11 criterion 3)', () => {
  const base = () => ({
    cwd,
    server: 'github',
    cache: { dir: cacheDir },
    discover: async () => snapshot,
  });

  it('shows the diff but does NOT widen without consent', async () => {
    const out = await runCurateRefresh({ ...base(), isTTY: false });
    expect(out.data.applied).toBe(false);
    expect(out.human).toContain('delete_repo');
    expect(out.human).toContain('Not added');
    expect(readFileSync(configPath(), 'utf8')).toBe(CONFIG); // untouched — no silent widening
  });

  it('widens the allow-list only with explicit consent (--yes)', async () => {
    const out = await runCurateRefresh({ ...base(), yes: true });
    expect(out.data.applied).toBe(true);
    const cfg = loadConfig(readFileSync(configPath(), 'utf8'));
    expect(cfg.ok && cfg.config.servers.github?.tools).toEqual({
      mode: 'allow',
      list: ['create_pr', 'delete_repo', 'search_code'], // sorted union
    });
  });

  it('is a no-op when the allow-list already covers the surface', async () => {
    writeFileSync(
      configPath(),
      CONFIG.replace('"search_code", "create_pr"', '"search_code", "create_pr", "delete_repo"'),
    );
    const out = await runCurateRefresh({ ...base(), yes: true });
    expect(out.data.applied).toBe(false);
    expect(out.human).toContain('up to date');
  });

  it('is a no-op for a deny-mode server (new tools already pass through)', async () => {
    writeFileSync(configPath(), CONFIG.replace('"mode": "allow"', '"mode": "deny"'));
    const out = await runCurateRefresh({ ...base(), yes: true });
    expect(out.data.applied).toBe(false);
    expect(out.human).toContain('deny/uncurated');
  });
});
