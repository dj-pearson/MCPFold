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
