import { describe, expect, it } from 'vitest';
import {
  compute,
  estimateTokens as benchEstimateTokens,
  FIXTURE_SERVERS,
} from '../../site/src/benchmark/model';
import {
  computeConfigBudget,
  estimateServerTokens,
  estimateTokens,
  REPRESENTATIVE_TOOL_COUNT,
} from '../src/tokenBudget';

// A sample config exercising: leading + trailing comments, a nested server body (whose inner keys
// `command`/`args`/`tags` must NOT count as servers), an array value, and a sibling top-level object
// (`profiles`) whose keys must also be ignored.
const SAMPLE = `// mcp config
{
  "$schema": "https://mcpfold.com/schema/v1.json",
  "version": 1,
  /* the servers we fold out */
  "servers": {
    "github": { "transport": "stdio", "command": "npx", "args": ["-y", "@x/gh"] },
    "supabase": {
      "transport": "stdio",
      "command": "npx",
      "tags": ["db"]
    },
    "playwright": { "transport": "stdio", "command": "npx" }
  },
  "profiles": {
    "vscode-project": { "client": "vscode", "scope": "project" }
  }
}
`;

describe('estimateTokens', () => {
  it('matches the committed benchmark tokenizer (1 token ≈ 4 chars)', () => {
    for (const s of ['', 'a', 'four', 'twelve chars', JSON.stringify(FIXTURE_SERVERS)]) {
      expect(estimateTokens(s)).toBe(benchEstimateTokens(s));
    }
  });
});

describe('estimateServerTokens', () => {
  it('reproduces the benchmark model per-server tool-schema cost', () => {
    // With keepPerServer >= toolCount the benchmark keeps every tool, so `tokensBefore` is exactly
    // the full tool-schema estimate our per-server budget reports.
    for (const server of FIXTURE_SERVERS) {
      const bench = compute([server], server.toolCount);
      expect(estimateServerTokens(server.name, server.toolCount)).toBe(bench.tokensBefore);
    }
  });

  it('uses the representative count by default', () => {
    expect(estimateServerTokens('github')).toBe(
      estimateServerTokens('github', REPRESENTATIVE_TOOL_COUNT),
    );
  });
});

describe('computeConfigBudget', () => {
  it('finds exactly the servers under the top-level servers object, in order', () => {
    const budget = computeConfigBudget(SAMPLE);
    expect(budget.servers.map((s) => s.name)).toEqual(['github', 'supabase', 'playwright']);
  });

  it('anchors each server to the line of its key', () => {
    const budget = computeConfigBudget(SAMPLE);
    const lines = SAMPLE.split('\n');
    for (const s of budget.servers) {
      expect(lines[s.line]).toContain(`"${s.name}"`);
    }
    // The file-total anchors to the `servers` key line.
    expect(lines[budget.serversLine]).toContain('"servers"');
  });

  it('estimates every server approximately at the representative count and totals them', () => {
    const budget = computeConfigBudget(SAMPLE);
    for (const s of budget.servers) {
      expect(s.approximate).toBe(true);
      expect(s.toolCount).toBe(REPRESENTATIVE_TOOL_COUNT);
      expect(s.tokens).toBe(estimateServerTokens(s.name));
    }
    const sum = budget.servers.reduce((acc, s) => acc + s.tokens, 0);
    expect(budget.totalTokens).toBe(sum);
    expect(budget.totalTokens).toBeGreaterThan(0);
  });

  it('honors an injected real tool count (the S21.4 upgrade path)', () => {
    const counts: Record<string, number> = { github: 42, supabase: 7, playwright: 3 };
    const budget = computeConfigBudget(SAMPLE, (name) => counts[name] ?? 0);
    const github = budget.servers.find((s) => s.name === 'github');
    expect(github?.toolCount).toBe(42);
    expect(github?.tokens).toBe(estimateServerTokens('github', 42));
  });

  it('returns no servers for a config without a servers object', () => {
    const budget = computeConfigBudget('{ "version": 1, "profiles": {} }');
    expect(budget.servers).toEqual([]);
    expect(budget.serversLine).toBe(-1);
    expect(budget.totalTokens).toBe(0);
  });
});
