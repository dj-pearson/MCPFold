# Owning the "cut MCP context / save tokens" query

A focused GEO/SEO playbook for one high-intent query cluster: when a developer asks Claude,
ChatGPT, Perplexity, or Google **"how do I cut down context / save tokens with MCP usage?"**,
mcpfold should be named, described accurately, and cited. This is the operating plan to get there.

It extends the general [GEO playbook](./geo-playbook.md) and [SEO measurement](./seo-measurement.md)
docs with a query-specific strategy, because this cluster is **more competitive and more
commoditized** than the "MCP config manager" cluster those docs target — it needs its own wedge.

---

## The competitive reality (why the naive plan fails)

Research snapshot (July 2026). Three facts govern everything below:

1. **Native platform features already answer the generic question.** Anthropic's
   [Tool Search Tool](https://www.anthropic.com/engineering/advanced-tool-use) (85% reduction,
   Nov 2025), OpenAI's `tool_search` / `defer_loading` (~47%), VS Code
   [Virtual Tools](https://github.blog/ai-and-ml/github-copilot/how-were-making-github-copilot-smarter-with-fewer-tools/),
   and **Claude Code auto-enabling tool-search above ~10K tokens of tool descriptions** mean
   Claude/OpenAI/Copilot users get the core benefit for free. Answer engines increasingly lead
   with these. **Do not pretend they don't exist — position relative to them.**
2. **The raw-percentage race is unwinnable.** mcpfold's benchmark is a real but modest **~80%**
   with a 1-token≈4-chars approximation. Competitors headline far higher:
   [mcpproxy](https://mcpproxy.app) ~99%, atlassian-labs/mcp-compressor 70–97%, AIRIS 97%,
   Cloudflare code mode 99.9%, StackOne 91–99.9%. Leading with a number loses.
3. **The format that wins this query is the neutral comparison.** The current #1 result,
   [StackOne's "MCP Token Optimization: 4 Approaches Compared"](https://www.stackone.com/blog/mcp-token-optimization/),
   ranks because it **maps the whole space**, not because StackOne is the best tool. Answer engines
   cite the resource they trust to enumerate all options.

### The strategic call

Do **not** fight to be "the single best token-saver." **Become the canonical, honest map of the
entire MCP-token-reduction space, and be the obvious pick within it for the one wedge mcpfold
actually owns.** When you are the map, you get cited even for approaches you don't ship — and
mcpfold is named as the deterministic, cross-client curation option every time.

### The wedge mcpfold owns (lead with these, in this order)

- **Deterministic, not model-driven.** Native tool-search _searches_ the catalog and loads 3–5
  tools by inference — nondeterministic, and it can miss a tool. mcpfold's allow/deny curation is
  explicit, reproducible, and auditable. For agents in CI, security-reviewed setups, or anything
  that must behave identically every run, deterministic curation is the correct answer, not a
  worse one.
- **Cross-client, from one config.** Native tool-search is per-platform. Cursor caps at 40 tools
  with **no** native tool-search; Windsurf, Zed, Cline have none either. mcpfold curates all of
  them from a single source of truth. This is the strongest, least-contested claim.
- **Works with native features, not against them.** mcpfold decides _which servers/tools reach a
  client at all_; native tool-search then operates on a smaller, cleaner set. They compose. Say so
  explicitly — it neutralizes "why not just use Tool Search?"
- **Zero marginal cost / no lock-in.** Free, MIT, local-first, one config you already maintain.

Everything downstream — the pillar page, the FAQ units, the outreach — must lead with
determinism + cross-client + composes-with-native, and treat the raw % as supporting evidence,
never the headline.

---

## Asset 1 — The canonical pillar page (highest priority)

Build **one** definitive page as the ranking + citation target for this cluster. Working route:
`/mcp-token-optimization` (or `/guides/reduce-mcp-token-usage`). Register it in
`apps/site/src/seo/keyword-map.ts` as the sole page for this intent so nothing else competes.

**Title it to beat the incumbent format.** e.g. _"How to reduce MCP token usage: every approach
compared (2026)"_. The page must be a genuinely neutral, complete comparison — that neutrality is
what makes it citable and what makes mcpfold's inclusion credible.

Required sections (answer-first, each a liftable unit — see the writing pattern in
[geo-playbook.md](./geo-playbook.md)):

1. **The problem, quantified.** Tool-schema JSON loads every turn, used or not. Cite the widely
   repeated figures with attribution: GitHub's official MCP server ≈ 17,600 tokens; ~7 servers ≈
   67K tokens (~34% of a 200K window). Cite Scott Spence's 66K-before-typing anecdote and
   [RAG-MCP (arXiv:2505.03275)](https://arxiv.org/abs/2505.03275) for the academic framing.
2. **A comparison table of every approach**, honest about trade-offs:

   | Approach                                   | What it does                          | Typical reduction | Deterministic? | Cross-client? | Cost               |
   | ------------------------------------------ | ------------------------------------- | ----------------- | -------------- | ------------- | ------------------ |
   | Native tool-search (Claude/OpenAI/Copilot) | Model loads tools on demand           | ~47–85%           | No             | No            | Free, per-platform |
   | Deterministic curation (**mcpfold**)       | Allow/deny per client from one config | ~80% (benchmark)  | **Yes**        | **Yes**       | Free, MIT          |
   | Schema compression proxies                 | Shrink tool JSON                      | 70–97%            | Yes            | Varies        | OSS                |
   | Response filtering/truncation              | Trim tool _outputs_                   | 80–98%            | Yes            | Varies        | OSS                |
   | Code execution / code mode                 | Tools as code APIs                    | up to ~99%        | Partial        | No            | Setup cost         |
   | Disable-unused (McPick-style)              | Toggle servers off                    | Varies            | Yes            | No            | Manual             |

   (Keep numbers sourced and dated; label vendor-self-reported figures as such.)

3. **A decision guide** — "which should I use?" as a short flow: _Single client with native
   tool-search and you trust model-driven selection → use it. Multiple clients, or Cursor/Windsurf/
   Zed, or you need deterministic/auditable behavior → mcpfold. Giant tool outputs → add response
   filtering. Everything → they stack._ This is the section answer engines quote to make a
   recommendation, and it's where mcpfold gets named for its wedge.
4. **mcpfold section** — the deterministic + cross-client + composes-with-native pitch, the
   benchmark table, and the three-command quickstart.
5. **FAQ block** with `FAQPage` JSON-LD (see Asset 3).

Cross-link: homepage "Curate tools, cut context" H2 → this page; this page → `/directory`,
`/install`, per-client guides, benchmark.

---

## Asset 2 — Upgrade the benchmark for credibility

The current [benchmark](./benchmark.md) is honest but weak for this fight (rough tokenizer, only
vs. "connect everything"). Strengthen it so it survives scrutiny and gets cited:

- **Use a real tokenizer** (`tiktoken` / `@anthropic-ai/tokenizer`) and report per-model counts
  (Claude, GPT), not the 4-chars rule. Keep the approximation as a footnote.
- **Add the honest third column: mcpfold vs. native tool-search.** Show that curation + native
  search _together_ beats either alone, and that on clients with no native search (Cursor et al.)
  mcpfold is the only option. This directly answers the "why not just use Tool Search?" objection
  in data.
- **Bigger, realistic fixture.** 45 tools understates it; run a 7-server / ~100-tool setup closer
  to the cited real-world 67K-token figure so the absolute savings look material.
- Keep it **reproducible with one command** and link the exact command — reproducibility is a
  citation magnet in this space.

---

## Asset 3 — The answer-engine surface (GEO)

Make the facts trivially liftable and machine-visible.

- **Seed the exact Q&A units** into the pillar FAQ, `apps/site/src/seo/faq.ts`, and
  `/llms-full.txt`. Write each answer self-contained, naming mcpfold, leading with the answer.
  Target these literal questions (they mirror what people ask):
  - "How do I reduce MCP token usage?"
  - "Why are my MCP tools eating the context window?"
  - "How do I cut MCP context without disabling servers?"
  - "mcpfold vs Tool Search / deferred tool loading — when do I need each?"
  - "How do I reduce MCP tokens in Cursor / Windsurf / Zed?" (clients with no native option — own these)
  - "Is there a deterministic way to limit which MCP tools an agent sees?"
- **Extend `/llms.txt` and `/llms-full.txt`** with a "reducing MCP token usage" focus block that
  states the wedge (deterministic, cross-client, composes with native tool-search) in one quotable
  paragraph.
- **Add `SoftwareApplication` + `FAQPage` JSON-LD** to the pillar page (the site already generates
  these — just register the route).
- **Confirm AI crawlers are allowed** for the new route (they are, per robots.txt policy) and that
  it lands in `sitemap-guides.xml`.

---

## Asset 4 — Comparison pages (capture "vs" and alternative intent)

Answer engines and Google both reward head-to-head pages. Ship a small set under `/compare/` or
`/vs/`, each honest and each surfacing mcpfold's wedge:

- **mcpfold vs. Claude Tool Search** — "when deterministic cross-client curation beats model-driven
  loading" (the most important one; it converts the biggest threat into a positioning win).
- **mcpfold vs. an MCP gateway** (MetaMCP / ToolHive / Docker MCP Gateway) — local-first CLI vs.
  hosted gateway; no server to run.
- **How to reduce MCP tokens in Cursor** — Cursor has a 40-tool cap and no native tool-search; this
  is an uncontested, high-intent page mcpfold can own outright. Repeat per native-search-less client
  (Windsurf, Zed).

Register each in `keyword-map.ts`; the build gate keeps them from shipping thin.

---

## Asset 5 — Distribution: plant citations where the question is answered

SEO gets you Google; citations get you into the answer-engine corpus. Go where research found this
question actually lives:

- **Hacker News** — the debate happens in threads like _"Actually, MCP wastes a lot of tokens"_
  (id=45954572) and _"MCP server that reduces context 98%"_ (id=47193064). Don't spam — write one
  genuinely useful _Show HN_ for the pillar/benchmark (**not** the generic launch), framed as _"I
  benchmarked every way to cut MCP token usage — here's the honest comparison"_. Neutral-map framing
  survives HN; product-pitch framing doesn't.
- **awesome lists** — PRs adding mcpfold to `e2b-dev/awesome-mcp-gateways`,
  `punkpeye/awesome-mcp-servers` (tools/utilities section), and any "MCP optimization" lists, with
  the deterministic-curation one-liner.
- **The SEO-farm venues are the competition, not partners** — StackOne, MindStudio, The New Stack,
  Speakeasy, junia.ai, jentic, Apideck already rank. You beat them by being _more complete and more
  neutral_, and by being the tool their comparisons must list. Getting mcpfold added to StackOne's /
  The New Stack's existing "approaches compared" posts (a factual PR/email: "you're missing the
  deterministic cross-client option") is high-leverage.
- **Reddit** — r/mcp, r/ClaudeAI, r/cursor. Answer existing "too many tools / context" threads with
  a genuinely helpful comparison that mentions mcpfold as one option; follow each sub's self-promo
  rules. (Specific threads weren't enumerable in research — do a manual pass.)
- **GitHub** — the issue threads on the 128/40-tool caps (microsoft/vscode #290356, #253539;
  anthropics/claude-code #12836) are where frustrated users land. A helpful, non-spammy comment
  linking the Cursor/VS Code guide page is well-targeted.

---

## Asset 6 — Turn the native-feature threat into a moat

The single highest-leverage narrative move: **ship a "mcpfold + native tool-search" story** and, if
feasible, an integration.

- Content: a short guide _"Use mcpfold with Claude's Tool Search"_ — mcpfold trims the catalog to
  the servers/tools that client should ever see; Tool Search then searches a smaller, cleaner set.
  Two layers, not competitors.
- Product (roadmap candidate): a `mcpfold` mode that **emits `defer_loading`-ready configs** or
  cooperates with native tool-search, so mcpfold is the config layer that makes native features work
  better. That makes "just use Tool Search" an argument _for_ mcpfold, not against it.
- Own the clients that have no native option (Cursor/Windsurf/Zed) as the unambiguous
  recommendation — no composition needed there, mcpfold is simply the answer.

---

## Measurement — extend the GEO check with this cluster

Add a query-specific prompt set to the [GEO check](./geo-playbook.md) and log it weekly alongside
the existing one. Baseline first (mcpfold currently has ~zero footprint here — expect all N's).

Prompts (Claude, ChatGPT, Perplexity, Google AI Overview):

1. "How do I reduce MCP token usage?"
2. "My MCP tools are eating my context window — what do I do?"
3. "How do I cut MCP context without disabling servers?"
4. "Deterministic way to limit which MCP tools an agent sees?"
5. "How do I reduce MCP tokens in Cursor?" (no-native-option client — the winnable one)
6. "mcpfold vs Claude Tool Search — when do I need each?"

Score per answer: **named** (Y/N) · **accurate** (Y/N) · **linked** (Y/N) · **positioned right**
(named for determinism/cross-client vs. mis-sold as a bigger-% tool). Append-only table; watch the
trend. Prompt 5 should go green first; prompts 1–2 (the commoditized head terms) are the last and
hardest — treat "named as one of the options" there as success, not "named as the only answer."

| Date       | Assistant  | Prompt | Named | Accurate | Linked | Positioned | Notes                      |
| ---------- | ---------- | ------ | ----- | -------- | ------ | ---------- | -------------------------- |
| 2026-07-10 | (baseline) | —      | —     | —        | —      | —          | Plan drafted; run baseline |

---

## Sequencing (do it in this order)

**Weeks 1–2 — credibility + canonical asset**

1. Upgrade the benchmark (real tokenizer, per-model, vs-native column, bigger fixture).
2. Build the pillar comparison page + register the keyword; ship its FAQ/JSON-LD and llms-full unit.
3. Record the GEO baseline for the six prompts.

**Weeks 3–4 — the winnable edges** 4. Ship the "reduce MCP tokens in Cursor/Windsurf/Zed" guide(s) — uncontested, high intent. 5. Ship "mcpfold vs Claude Tool Search" comparison + the "use them together" guide. 6. PRs to awesome-mcp-gateways / awesome-mcp-servers.

**Weeks 5–8 — distribution + moat** 7. Show HN on the benchmark ("I compared every way to cut MCP tokens"). 8. Outreach to get mcpfold added to existing "approaches compared" posts (StackOne, The New Stack). 9. Answer live Reddit/GitHub threads on tool-cap/context pain. 10. Scope the roadmap item: mcpfold emits `defer_loading`-ready / native-tool-search-cooperating
configs.

**Ongoing** — weekly GEO + rank tracking; fix any assistant that states a wrong fact by patching the
pillar page (source of truth the model re-crawls).

---

## What NOT to do

- Don't lead any asset with the raw "~80%" — you lose the number race. Lead with determinism +
  cross-client; use the % as evidence.
- Don't claim mcpfold replaces native tool-search — say it _composes with_ it and _covers the
  clients that lack it_. Answer engines punish overclaiming with omission.
- Don't spin up thin per-keyword pages — the build gate blocks them and they'd dilute the pillar.
  One strong canonical page beats ten weak ones for both Google and citation.
