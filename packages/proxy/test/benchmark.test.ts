import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  AT_SCALE_SERVERS,
  formatMarkdown,
  runBenchmark,
  TOKENIZERS,
} from '../bench/context-benchmark.js';

// `pnpm --filter @mcpfold/proxy bench` (WRITE_BENCH=1) regenerates docs/benchmark.md.
const docPath = fileURLToPath(new URL('../../../docs/benchmark.md', import.meta.url));
const renderDoc = (): string =>
  formatMarkdown(runBenchmark(), runBenchmark(AT_SCALE_SERVERS));

beforeAll(() => {
  if (process.env.WRITE_BENCH === '1') writeFileSync(docPath, renderDoc());
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

  it('publishes the load-bearing headline numbers (asserted by the site + its e2e)', () => {
    const r = runBenchmark();
    // These exact figures are embedded across the site, docs, and a blog post — the whole point
    // of the benchmark being reproducible is that they never move by accident.
    expect(r.tokensBefore).toBe(7476);
    expect(r.tokensAfter).toBe(1497);
    expect(r.reductionPct).toBe(80);
  });

  it('per-server rows sum to the totals', () => {
    const r = runBenchmark();
    expect(r.rows.reduce((n, row) => n + row.tokensBefore, 0)).toBe(r.tokensBefore);
    expect(r.rows.reduce((n, row) => n + row.toolsAfter, 0)).toBe(r.toolsAfter);
  });
});

describe('exact per-model token counts (S21.3)', () => {
  it('reports the approximation plus at least one GPT and one Claude tokenizer', () => {
    const ids = TOKENIZERS.map((t) => t.id);
    expect(ids).toContain('approx');
    expect(ids.some((id) => id.startsWith('gpt'))).toBe(true);
    expect(ids).toContain('claude');
  });

  it('the approx tokenizer entry equals the headline totals exactly', () => {
    const r = runBenchmark();
    const approx = r.byTokenizer.find((t) => t.id === 'approx');
    expect(approx?.tokensBefore).toBe(r.tokensBefore);
    expect(approx?.tokensAfter).toBe(r.tokensAfter);
  });

  it('exact counts are deterministic and match a committed snapshot', () => {
    // Real tokenizers are deterministic and offline, so these counts are stable cross-OS. If a
    // tokenizer dependency bumps its BPE and these move, regenerate the doc (pnpm bench) and update.
    const r = runBenchmark();
    const snapshot = Object.fromEntries(
      r.byTokenizer.map((t) => [t.id, [t.tokensBefore, t.tokensAfter, t.reductionPct]]),
    );
    expect(snapshot).toEqual({
      approx: [7476, 1497, 80],
      'gpt-4o': [7576, 1521, 80],
      'gpt-4': [7444, 1497, 80],
      claude: [7266, 1464, 80],
    });
  });

  it('every real tokenizer confirms the ~80% headline reduction', () => {
    const r = runBenchmark();
    for (const t of r.byTokenizer) {
      expect(t.reductionPct).toBeGreaterThanOrEqual(78);
      expect(t.reductionPct).toBeLessThanOrEqual(82);
    }
  });
});

describe('at-scale fixture (S21.3)', () => {
  it('is a larger ~100-tool setup with material absolute savings', () => {
    const r = runBenchmark(AT_SCALE_SERVERS);
    expect(r.toolsBefore).toBe(101);
    expect(r.toolsAfter).toBe(21);
    // "Material" = the approximation before-count is in the tens of thousands.
    expect(r.tokensBefore).toBeGreaterThan(10_000);
    expect(r.reductionPct).toBeGreaterThan(70);
  });
});

describe('docs/benchmark.md stays in lockstep with the generator', () => {
  it('the committed doc equals formatMarkdown output (run `pnpm bench` after any change)', () => {
    const committed = readFileSync(docPath, 'utf8');
    expect(committed).toBe(renderDoc());
  });
});
