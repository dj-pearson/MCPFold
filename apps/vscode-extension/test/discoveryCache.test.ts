import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cacheToolCountFor, cachedToolCount } from '../src/discoveryCache';
import { computeConfigBudget, REPRESENTATIVE_TOOL_COUNT } from '../src/tokenBudget';

/**
 * S24.9: the token-budget CodeLens consumes the CLI's discovery cache (`mcpfold inspect`) through the
 * `toolCountFor` injector, so a server mcpfold has introspected shows its REAL tool count (exact, not
 * approximate) while an un-introspected server keeps the representative assumption.
 */

let dir: string;
const writeSnapshot = (server: string, toolCount: number) =>
  writeFileSync(join(dir, `${server}.json`), JSON.stringify({ server, toolCount, tools: [] }));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ext-discovery-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('cachedToolCount', () => {
  it('returns the snapshot tool count, or undefined when absent/unreadable', () => {
    writeSnapshot('github', 35);
    expect(cachedToolCount('github', dir)).toBe(35);
    expect(cachedToolCount('missing', dir)).toBeUndefined();
    writeFileSync(join(dir, 'broken.json'), '{ not json');
    expect(cachedToolCount('broken', dir)).toBeUndefined();
  });
});

describe('computeConfigBudget with the discovery-cache injector (S24.9)', () => {
  const CONFIG = `{
    "version": 1,
    "servers": {
      "github": { "transport": "stdio", "command": "gh" },
      "unknown": { "transport": "stdio", "command": "x" }
    }
  }`;

  it('uses the real count (exact) for a cached server and the assumption (approx) otherwise', () => {
    writeSnapshot('github', 35);
    const budget = computeConfigBudget(CONFIG, cacheToolCountFor(dir));

    const github = budget.servers.find((s) => s.name === 'github')!;
    expect(github.toolCount).toBe(35);
    expect(github.approximate).toBe(false);

    const unknown = budget.servers.find((s) => s.name === 'unknown')!;
    expect(unknown.toolCount).toBe(REPRESENTATIVE_TOOL_COUNT);
    expect(unknown.approximate).toBe(true);
  });

  it('defaults to the approximate representative count with no cache', () => {
    const budget = computeConfigBudget(CONFIG);
    expect(budget.servers.every((s) => s.approximate)).toBe(true);
    expect(budget.servers.every((s) => s.toolCount === REPRESENTATIVE_TOOL_COUNT)).toBe(true);
  });
});
