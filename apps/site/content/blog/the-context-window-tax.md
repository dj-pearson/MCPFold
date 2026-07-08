---
title: The context-window tax
date: 2026-07-07
description: How much of your agent's context does MCP tool-schema JSON consume — and how much does per-tool curation cut it? A reproducible benchmark.
---

Every MCP server you connect advertises its tools by dumping their full JSON schemas into the
model's context on every turn — whether the agent uses them or not. Connect enough servers and a
meaningful slice of the window is gone before the model reads a single line of your actual problem.
We call it the context-window tax.

## The method

We measured a representative three-server setup — github (20 tools), supabase (15), playwright
(10): **45 tools total** — serializing each server's `tools/list` payload before and after
mcpfold's per-tool curation. The tokenizer is the widely-cited approximation of **1 token ≈ 4
characters** of JSON. Exact counts vary by model, but the _relative_ reduction is stable because
both sides are measured identically.

## The result

Curating down to the **9 tools** actually needed cuts tool-schema tokens by **~80%**
(**7,476 → 1,497**). No extra configuration — the shim already in the launch path does the
filtering, so the win is free.

> Curation turns "connect every server" from a context-window tax into a cheap, fast, focused
> toolset.

Reproduce it yourself with `pnpm --filter @mcpfold/proxy bench`, or try the
[interactive calculator](/) on the homepage. Full methodology lives in the
[benchmark docs](/docs/benchmark.html).
