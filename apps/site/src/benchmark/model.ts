/**
 * Client-side context-window benchmark (S13.2) — a faithful port of the committed methodology in
 * packages/proxy/bench/context-benchmark.ts (S5.4), so the site and docs can never disagree.
 * Pure + deterministic: no secrets, no network. The home.e2e.ts test asserts the default fixture
 * reproduces the published numbers (7476 → 1497, ~80%), so the site can't drift from the docs.
 *
 * Tokenizer: the documented 1 token ≈ 4 characters of serialized JSON. Exact counts vary by model
 * tokenizer, but the relative reduction — what we report — is stable because both sides measure it
 * identically.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

interface McpTool {
  name: string;
  description: string;
  inputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
}

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

export interface BenchServer {
  name: string;
  toolCount: number;
}

/** The published fixture: github (20 tools), supabase (15), playwright (10) — 45 total. */
export const FIXTURE_SERVERS: BenchServer[] = [
  { name: 'github', toolCount: 20 },
  { name: 'supabase', toolCount: 15 },
  { name: 'playwright', toolCount: 10 },
];

export interface BenchResult {
  toolsBefore: number;
  toolsAfter: number;
  tokensBefore: number;
  tokensAfter: number;
  reductionPct: number;
}

/**
 * Compute before/after for the chosen servers, keeping `keepPerServer` tools each (capped at a
 * server's tool count). The default (all fixture servers, keep 3) reproduces the committed result.
 */
export function compute(servers: BenchServer[], keepPerServer: number): BenchResult {
  let toolsBefore = 0;
  let toolsAfter = 0;
  let tokensBefore = 0;
  let tokensAfter = 0;
  for (const s of servers) {
    const all = makeTools(s.name, s.toolCount);
    const keep = Math.min(keepPerServer, all.length);
    const after = all.slice(0, keep);
    toolsBefore += all.length;
    toolsAfter += after.length;
    tokensBefore += estimateTokens(JSON.stringify(all));
    tokensAfter += estimateTokens(JSON.stringify(after));
  }
  const reductionPct = tokensBefore === 0 ? 0 : Math.round((1 - tokensAfter / tokensBefore) * 100);
  return { toolsBefore, toolsAfter, tokensBefore, tokensAfter, reductionPct };
}
