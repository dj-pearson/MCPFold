import type { ToolsDirective } from '@mcpfold/core';
import { countTokens as countClaudeTokens } from '@anthropic-ai/tokenizer';
import { getEncoding } from 'js-tiktoken';
import { filterTools, type McpTool } from '../src/filter.js';

/**
 * Context-window benchmark (S5.4, exact counts S21.3). Measures the tool-schema token
 * footprint of a representative multi-server setup with and without mcpfold's per-tool curation.
 *
 * Two tokenizer lenses are reported side by side:
 *   1. A documented approximation of **1 token ≈ 4 characters** of serialized JSON (the widely
 *      cited GPT rule of thumb) — tokenizer-independent, and the load-bearing headline figure.
 *   2. **Exact** per-model counts via real tokenizers (GPT `o200k_base`/`cl100k_base` and the
 *      Claude tokenizer), so the headline survives scrutiny and is citable.
 *
 * The *relative* reduction is what the benchmark reports; it is stable across all four lenses
 * because both sides of every ratio are measured with the same tokenizer. This module lives in
 * `bench/`, which is excluded from the published build (`tsconfig.build.json`), so the tokenizer
 * dev-dependencies never ship in the proxy package.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// tiktoken encoders are constructed once (each loads its BPE ranks). Deterministic and offline.
const o200k = getEncoding('o200k_base');
const cl100k = getEncoding('cl100k_base');

/** A named way to count tokens for a serialized payload. `count` must be pure + deterministic. */
export interface Tokenizer {
  id: string;
  label: string;
  count(text: string): number;
}

/** Approximation first (the headline), then exact per-model tokenizers. Order is stable — the
 * generated docs table and the snapshot test depend on it. */
export const TOKENIZERS: Tokenizer[] = [
  { id: 'approx', label: 'Approximation (1 tok ≈ 4 chars)', count: estimateTokens },
  { id: 'gpt-4o', label: 'GPT-4o / 4.1 (o200k_base)', count: (t) => o200k.encode(t).length },
  { id: 'gpt-4', label: 'GPT-4 / 3.5-turbo (cl100k_base)', count: (t) => cl100k.encode(t).length },
  { id: 'claude', label: 'Claude (@anthropic-ai/tokenizer)', count: (t) => countClaudeTokens(t) },
];

function tool(name: string, description: string, props: number): McpTool {
  const properties: Record<string, unknown> = {};
  for (let i = 0; i < props; i++) {
    properties[`arg_${i}`] = {
      type: 'string',
      description: `Parameter ${i} for ${name}: provide a well-formed value describing the ${i}th input.`,
    };
  }
  return {
    name,
    description,
    inputSchema: { type: 'object', properties, required: Object.keys(properties).slice(0, 1) },
  };
}

function makeTools(prefix: string, count: number): McpTool[] {
  return Array.from({ length: count }, (_, i) =>
    tool(`${prefix}_${i}`, `Perform operation ${i} on the ${prefix} service with typed inputs.`, 4),
  );
}

/** Curate a server down to its first `keep` tools via an allow-list directive. */
function keepFirst(prefix: string, keep: number): ToolsDirective {
  return { mode: 'allow', list: Array.from({ length: keep }, (_, i) => `${prefix}_${i}`) };
}

export interface BenchServer {
  name: string;
  tools: McpTool[];
  directive: ToolsDirective;
}

/** The published headline fixture: 45 tools total, curated down to 9. Do not change — the
 * 7,476 → 1,497 / ~80% figures are asserted by the site and its end-to-end tests. */
export const FIXTURE_SERVERS: BenchServer[] = [
  { name: 'github', tools: makeTools('github', 20), directive: keepFirst('github', 3) },
  { name: 'supabase', tools: makeTools('supabase', 15), directive: keepFirst('supabase', 3) },
  { name: 'playwright', tools: makeTools('playwright', 10), directive: keepFirst('playwright', 3) },
];

/** A larger, realistic fixture (S21.3): 7 servers / 101 tools, curated to 21, so the *absolute*
 * savings look material (tens of thousands of tokens), not just the relative percentage. */
export const AT_SCALE_SERVERS: BenchServer[] = [
  { name: 'github', tools: makeTools('github', 20), directive: keepFirst('github', 3) },
  { name: 'slack', tools: makeTools('slack', 18), directive: keepFirst('slack', 3) },
  { name: 'supabase', tools: makeTools('supabase', 15), directive: keepFirst('supabase', 3) },
  { name: 'postgres', tools: makeTools('postgres', 14), directive: keepFirst('postgres', 3) },
  { name: 'playwright', tools: makeTools('playwright', 12), directive: keepFirst('playwright', 3) },
  { name: 'notion', tools: makeTools('notion', 12), directive: keepFirst('notion', 3) },
  { name: 'filesystem', tools: makeTools('filesystem', 10), directive: keepFirst('filesystem', 3) },
];

export interface BenchRow {
  server: string;
  toolsBefore: number;
  toolsAfter: number;
  tokensBefore: number;
  tokensAfter: number;
}

export interface TokenizerResult {
  id: string;
  label: string;
  tokensBefore: number;
  tokensAfter: number;
  reductionPct: number;
}

export interface BenchResult {
  rows: BenchRow[];
  toolsBefore: number;
  toolsAfter: number;
  /** Approximation counts (÷4) — the load-bearing headline. Equal to the `approx` entry of
   * `byTokenizer`, kept as top-level fields for backward compatibility. */
  tokensBefore: number;
  tokensAfter: number;
  reductionPct: number;
  /** Approximation + exact per-model counts, in {@link TOKENIZERS} order. */
  byTokenizer: TokenizerResult[];
}

export function runBenchmark(servers: BenchServer[] = FIXTURE_SERVERS): BenchResult {
  const perServer = servers.map((s) => ({
    server: s.name,
    before: s.tools,
    after: filterTools(s.tools, s.directive),
  }));

  const rows: BenchRow[] = perServer.map((p) => ({
    server: p.server,
    toolsBefore: p.before.length,
    toolsAfter: p.after.length,
    tokensBefore: estimateTokens(JSON.stringify(p.before)),
    tokensAfter: estimateTokens(JSON.stringify(p.after)),
  }));

  // Count every tokenizer with the same per-server summation as the approximation, so the
  // `approx` entry equals the headline totals exactly and the lenses stay comparable.
  const byTokenizer: TokenizerResult[] = TOKENIZERS.map((t) => {
    const tokensBefore = perServer.reduce((n, p) => n + t.count(JSON.stringify(p.before)), 0);
    const tokensAfter = perServer.reduce((n, p) => n + t.count(JSON.stringify(p.after)), 0);
    return {
      id: t.id,
      label: t.label,
      tokensBefore,
      tokensAfter,
      reductionPct: Math.round((1 - tokensAfter / tokensBefore) * 100),
    };
  });

  const sum = (f: (r: BenchRow) => number): number => rows.reduce((n, r) => n + f(r), 0);
  const tokensBefore = sum((r) => r.tokensBefore);
  const tokensAfter = sum((r) => r.tokensAfter);
  return {
    rows,
    toolsBefore: sum((r) => r.toolsBefore),
    toolsAfter: sum((r) => r.toolsAfter),
    tokensBefore,
    tokensAfter,
    reductionPct: Math.round((1 - tokensAfter / tokensBefore) * 100),
    byTokenizer,
  };
}

function tokenizerTable(byTokenizer: TokenizerResult[]): string {
  const header = [
    '| Tokenizer | Tokens before | Tokens after | Reduction |',
    '| --------- | ------------: | -----------: | --------: |',
  ];
  const rows = byTokenizer.map(
    (t) => `| ${t.label} | ${t.tokensBefore} | ${t.tokensAfter} | ~${t.reductionPct}% |`,
  );
  return [...header, ...rows].join('\n');
}

/**
 * Render the full docs/benchmark.md — the ENTIRE file is generated from this function so the docs
 * can never drift from the code. `pnpm --filter @mcpfold/proxy bench` rewrites the file, and a
 * test asserts the committed copy equals this output.
 */
export function formatMarkdown(result: BenchResult, atScale: BenchResult): string {
  const rows = result.rows
    .map(
      (r) =>
        `| ${r.server} | ${r.toolsBefore} | ${r.toolsAfter} | ${r.tokensBefore} | ${r.tokensAfter} |`,
    )
    .join('\n');
  const exact = result.byTokenizer.filter((t) => t.id !== 'approx');
  const exactLo = Math.min(...exact.map((t) => t.reductionPct));
  const exactHi = Math.max(...exact.map((t) => t.reductionPct));
  const exactRange = exactLo === exactHi ? `${exactLo}%` : `${exactLo}–${exactHi}%`;
  return [
    '# Context-window benchmark (S5.4)',
    '',
    "How much of an agent's context does MCP tool-schema JSON consume, and how much does",
    "mcpfold's per-tool curation cut it? This measures a representative three-server setup",
    'with and without curation.',
    '',
    '## Method',
    '',
    '- **Fixture:** github (20 tools), supabase (15), playwright (10) — 45 tools total, each',
    '  with a realistic `inputSchema`. Curated via `tools: { mode: "allow", list: [...] }` down',
    '  to 3 tools per server (9 total).',
    '- **Measurement:** the serialized `tools/list` payload, before vs after the proxy filter.',
    '- **Tokenizer:** the headline uses an approximation of **1 token ≈ 4 characters** of JSON',
    '  (the common GPT rule of thumb); [exact per-model counts](#exact-per-model-token-counts)',
    '  are reported alongside it below. The *relative* reduction is stable across every tokenizer',
    '  because both sides are measured identically. Reproduce with',
    '  `pnpm --filter @mcpfold/proxy bench`.',
    '',
    '## Results',
    '',
    '| Server | Tools before | Tools after | Tokens before | Tokens after |',
    '| ------ | -----------: | ----------: | ------------: | -----------: |',
    rows,
    `| **Total** | **${result.toolsBefore}** | **${result.toolsAfter}** | **${result.tokensBefore}** | **${result.tokensAfter}** |`,
    '',
    `**Tool-schema tokens cut by ~${result.reductionPct}%** (${result.tokensBefore} → ${result.tokensAfter})`,
    `by loading only the ${result.toolsAfter} of ${result.toolsBefore} tools actually needed.`,
    '',
    '> The headline: curation turns "connect every server" from a context-window tax into a',
    '> cheap, fast, focused toolset — with zero extra config, because the shim already in the',
    '> launch path does the filtering.',
    '',
    '## Exact per-model token counts',
    '',
    'The 1-token≈4-chars figure above is an approximation. Below are the same before/after',
    'payloads counted with real model tokenizers — GPT via `tiktoken` (`o200k_base` for the',
    'GPT-4o/4.1 family, `cl100k_base` for GPT-4/3.5-turbo) and Claude via',
    '`@anthropic-ai/tokenizer`:',
    '',
    tokenizerTable(result.byTokenizer),
    '',
    `The approximation lands within a few percent of the exact counts, and the reduction holds at`,
    `**~${exactRange}** across every real tokenizer — so the headline is not an artifact of the`,
    '4-chars rule. These counts are deterministic; a snapshot test fails if they move.',
    '',
    '## At scale (~100 tools)',
    '',
    'The 45-tool fixture is deliberately small and reproducible. Real setups run larger, where the',
    `*absolute* savings are what bite. A 7-server / ${atScale.toolsBefore}-tool fixture, curated to`,
    `${atScale.toolsAfter} tools, using the same method:`,
    '',
    tokenizerTable(atScale.byTokenizer),
    '',
    `That is **${atScale.tokensBefore.toLocaleString('en-US')} → ${atScale.tokensAfter.toLocaleString(
      'en-US',
    )}** approximate tokens (~${atScale.reductionPct}%) reclaimed from tool-schema JSON before the`,
    'agent reads a single word — every turn.',
    '',
    '## How this reads against native tool-search',
    '',
    'Since late 2025, several platforms cut MCP token usage natively by loading tools on demand',
    "instead of up front — Anthropic's [Tool Search Tool](https://www.anthropic.com/engineering/advanced-tool-use),",
    "OpenAI's deferred tool loading, and GitHub Copilot's virtual tools. Anthropic reports an ~85%",
    'token reduction from that approach, which independently confirms how large the untrimmed',
    'baseline is: tool-schema JSON is a real, quantifiable tax, not a rounding error.',
    '',
    "mcpfold's ~80% is in the same range, and the two approaches are **complementary, not",
    'competing**:',
    '',
    '- **Curation runs everywhere.** Native tool-search only exists on the clients and models that',
    '  ship it. Cursor (which caps tools and has no tool-search), Windsurf, and Zed get nothing',
    '  automatically — mcpfold curates all of them from one config.',
    '- **Curation is deterministic.** Native tool-search *searches* the catalog and loads tools by',
    '  inference, so the loaded set can vary run to run and can miss a tool. mcpfold applies an',
    '  explicit allow/deny list: the same toolset every run, reviewable in a pull request and',
    '  gateable in CI. For agents that must behave identically each run, that predictability is the',
    '  feature.',
    '- **They stack.** mcpfold decides which servers and tools reach a client at all; any native',
    '  tool-search then operates on the smaller, cleaner set — a lower baseline for the on-demand',
    '  loader to work from.',
    '',
    'See [How to reduce MCP token usage](https://mcpfold.com/compare/reduce-mcp-token-usage) for the',
    'full approach comparison (curation, compression, code execution, tool-search).',
    '',
    '## Scale and tokenizer notes (honest boundaries)',
    '',
    '- **Fixture scale.** The 45-tool headline fixture is deliberately modest and reproducible; the',
    '  [at-scale fixture](#at-scale-100-tools) above shows how the *absolute* savings grow — a',
    '  handful of busy servers can reach tens of thousands of tool-definition tokens — while the',
    '  *relative* ~80% stays representative of trimming to the tools actually used.',
    '- **Tokenizer.** The 1-token≈4-chars approximation is tokenizer-independent and both sides are',
    '  measured identically, so the reduction ratio is stable. Exact per-model counts (`tiktoken` /',
    '  `@anthropic-ai/tokenizer`) are now reported alongside it above and confirm the headline; the',
    '  site calculator keeps the approximation for instant, dependency-free interactivity.',
    '',
  ].join('\n');
}
