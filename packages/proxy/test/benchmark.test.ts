import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { formatMarkdown, runBenchmark } from '../bench/context-benchmark.js';

// `pnpm --filter @mcpfold/proxy bench` (WRITE_BENCH=1) regenerates docs/benchmark.md.
const docPath = fileURLToPath(new URL('../../../docs/benchmark.md', import.meta.url));

beforeAll(() => {
  if (process.env.WRITE_BENCH === '1') writeFileSync(docPath, formatMarkdown(runBenchmark()));
});

describe('context-window benchmark (S5.4)', () => {
  it('curation reduces the tool-schema token footprint substantially', () => {
    const r = runBenchmark();
    expect(r.toolsBefore).toBe(45);
    expect(r.toolsAfter).toBe(9);
    expect(r.tokensAfter).toBeLessThan(r.tokensBefore);
    // 45 → 9 tools should cut well over half the schema tokens.
    expect(r.reductionPct).toBeGreaterThan(50);
  });

  it('per-server rows sum to the totals', () => {
    const r = runBenchmark();
    expect(r.rows.reduce((n, row) => n + row.tokensBefore, 0)).toBe(r.tokensBefore);
    expect(r.rows.reduce((n, row) => n + row.toolsAfter, 0)).toBe(r.toolsAfter);
  });
});
