import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ToolsDirective } from '@mcpfold/core';
import { estimateToolTokens } from '@mcpfold/core';
import { writeSnapshot } from '../src/discover/cache.js';
import {
  formatTokens,
  renderSavingsBlock,
  renderServerSavingsLine,
  serverSavings,
} from '../src/discover/savings.js';

/**
 * Honest savings reporting (S24.9): every number is measured from the user's own discovery snapshot +
 * their directive; with nothing curated we say exactly that instead of quoting a fixture.
 */

const TOOLS = ['a', 'b', 'c', 'd'].map((n) => ({
  name: n,
  description: `tool ${n}`,
  inputSchema: { type: 'object' },
}));

const snapshot = {
  server: 'github',
  capturedAt: '2026-07-13T00:00:00.000Z',
  transport: 'stdio' as const,
  toolCount: TOOLS.length,
  totalTokens: TOOLS.reduce((s, t) => s + estimateToolTokens(t), 0),
  tools: TOOLS.map((t) => ({ name: t.name, tokens: estimateToolTokens(t) })),
};

describe('serverSavings', () => {
  it('measures the kept subset against the full surface for an allow directive', () => {
    const directive: ToolsDirective = { mode: 'allow', list: ['a', 'b'] };
    const s = serverSavings(snapshot, directive);
    expect(s.fullCount).toBe(4);
    expect(s.keptCount).toBe(2);
    expect(s.fullTokens).toBe(snapshot.totalTokens);
    const expectedKept =
      snapshot.tools.find((t) => t.name === 'a')!.tokens +
      snapshot.tools.find((t) => t.name === 'b')!.tokens;
    expect(s.keptTokens).toBe(expectedKept);
  });

  it('a deny directive keeps everything except the denied tools', () => {
    const s = serverSavings(snapshot, { mode: 'deny', list: ['d'] });
    expect(s.keptCount).toBe(3);
  });
});

describe('formatTokens', () => {
  it('is a prefixed estimate, compacting thousands', () => {
    expect(formatTokens(900)).toBe('~900');
    expect(formatTokens(1497)).toBe('~1.5k');
    expect(formatTokens(5800)).toBe('~5.8k');
  });
});

describe('renderServerSavingsLine', () => {
  it('reads "N of M tools, ~X → ~Y tokens (approx)"', () => {
    const line = renderServerSavingsLine(serverSavings(snapshot, { mode: 'allow', list: ['a'] }));
    expect(line).toMatch(/^github: 1 of 4 tools, ~\d+ → ~\d+ tokens \(approx\)$/);
  });
});

describe('renderSavingsBlock', () => {
  let cacheDir: string;
  beforeEach(() => {
    cacheDir = mkdtempSync(join(tmpdir(), 'mcpfold-savings-'));
  });
  afterEach(() => rmSync(cacheDir, { recursive: true, force: true }));

  it('says nothing is curated (and labels the benchmark as a benchmark) when no directive exists', () => {
    const lines = renderSavingsBlock({ github: {} });
    expect(lines[0]).toContain('No curation active');
    expect(lines.join('\n')).toContain('benchmark');
    expect(lines.join('\n')).not.toContain('Typical context savings');
  });

  it('nudges to inspect when curated but no snapshot is cached yet', () => {
    const lines = renderSavingsBlock(
      { github: { tools: { mode: 'allow', list: ['a'] } } },
      { dir: cacheDir },
    );
    expect(lines.join('\n')).toContain('mcpfold inspect');
    expect(lines.join('\n')).not.toContain('Measured');
  });

  it('reports measured per-server + total savings when a snapshot exists', () => {
    writeSnapshot(snapshot, { dir: cacheDir });
    const lines = renderSavingsBlock(
      { github: { tools: { mode: 'allow', list: ['a', 'b'] } } },
      { dir: cacheDir },
    );
    expect(lines[0]).toContain('Measured context savings');
    expect(lines.some((l) => /github: 2 of 4 tools/.test(l))).toBe(true);
    expect(lines.some((l) => /Total: ~\d+.*→.*tokens \(approx\)/.test(l))).toBe(true);
  });
});
