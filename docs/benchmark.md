# Context-window benchmark (S5.4)

How much of an agent's context does MCP tool-schema JSON consume, and how much does
mcpfold's per-tool curation cut it? This measures a representative three-server setup
with and without curation.

## Method

- **Fixture:** github (20 tools), supabase (15), playwright (10) — 45 tools total, each
  with a realistic `inputSchema`. Curated via `tools: { mode: "allow", list: [...] }` down
  to 3 tools per server (9 total).
- **Measurement:** the serialized `tools/list` payload, before vs after the proxy filter.
- **Tokenizer:** approximation of **1 token ≈ 4 characters** of JSON (the common GPT rule
  of thumb). Exact counts vary by model tokenizer, but the *relative* reduction is stable
  because both sides are measured identically. Reproduce with
  `pnpm --filter @mcpfold/proxy bench`.

## Results

| Server | Tools before | Tools after | Tokens before | Tokens after |
| ------ | -----------: | ----------: | ------------: | -----------: |
| github | 20 | 3 | 3281 | 490 |
| supabase | 15 | 3 | 2502 | 499 |
| playwright | 10 | 3 | 1693 | 508 |
| **Total** | **45** | **9** | **7476** | **1497** |

**Tool-schema tokens cut by ~80%** (7476 → 1497)
by loading only the 9 of 45 tools actually needed.

> The headline: curation turns "connect every server" from a context-window tax into a
> cheap, fast, focused toolset — with zero extra config, because the shim already in the
> launch path does the filtering.

## How this reads against native tool-search

Since late 2025, several platforms cut MCP token usage natively by loading tools on demand
instead of up front — Anthropic's [Tool Search Tool](https://www.anthropic.com/engineering/advanced-tool-use),
OpenAI's deferred tool loading, and GitHub Copilot's virtual tools. Anthropic reports an ~85%
token reduction from that approach, which independently confirms how large the untrimmed
baseline is: tool-schema JSON is a real, quantifiable tax, not a rounding error.

mcpfold's ~80% is in the same range, and the two approaches are **complementary, not
competing**:

- **Curation runs everywhere.** Native tool-search only exists on the clients and models that
  ship it. Cursor (which caps tools and has no tool-search), Windsurf, and Zed get nothing
  automatically — mcpfold curates all of them from one config.
- **Curation is deterministic.** Native tool-search *searches* the catalog and loads tools by
  inference, so the loaded set can vary run to run and can miss a tool. mcpfold applies an
  explicit allow/deny list: the same toolset every run, reviewable in a pull request and
  gateable in CI. For agents that must behave identically each run, that predictability is the
  feature.
- **They stack.** mcpfold decides which servers and tools reach a client at all; any native
  tool-search then operates on the smaller, cleaner set — a lower baseline for the on-demand
  loader to work from.

See [How to reduce MCP token usage](https://mcpfold.com/compare/reduce-mcp-token-usage) for the
full approach comparison (curation, compression, code execution, tool-search).

## Scale and tokenizer notes (honest boundaries)

- **Fixture scale.** The 45-tool fixture is deliberately modest and reproducible. Real setups
  are often larger — a handful of busy servers can reach tens of thousands of tool-definition
  tokens — so the *absolute* savings in practice are typically larger than the fixture's, while
  the *relative* ~80% is representative of trimming to the tools actually used.
- **Tokenizer.** The 1-token≈4-chars approximation is used because it is tokenizer-independent
  and both sides are measured identically, so the reduction ratio is stable. A follow-up
  (tracked in [the token-query plan](./token-query-geo-plan.md)) is to also report exact
  per-model counts via `tiktoken` / `@anthropic-ai/tokenizer` for headline credibility — a
  coordinated change because the ~80%/7,476→1,497 figures are asserted by the site and its
  end-to-end tests.
