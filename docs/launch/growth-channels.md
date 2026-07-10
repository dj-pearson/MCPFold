# Growth channels — ongoing distribution copy

Copy-paste-ready assets for the always-on channels that complement the SEO/GEO pages (which compound
slowly) with near-term reach. Strategy: [../exposure-plan.md](../exposure-plan.md). One-time launch
listings (Product Hunt, Show HN, directories) live in [listings.md](./listings.md).

Everywhere: lead with the **free calculator or the honest data**, not the product. The funnel is
utility → the token/context problem → mcpfold as the deterministic, cross-client fix.

---

## Dev-tool newsletters (submit once — 20-minute win each)

These curate exactly this audience and most makers never bother submitting.

| Newsletter                                        | How to submit                    | Angle to use                                                    |
| ------------------------------------------------- | -------------------------------- | --------------------------------------------------------------- |
| **Console.dev**                                   | console.dev "submit a tool" form | "Free CLI + token calculator for MCP" — they love OSS dev tools |
| **TLDR** (Web Dev / AI)                           | tldr.tech sponsor/submit         | The benchmark data + calculator                                 |
| **Bytes** (JS)                                    | submit via their site            | The cross-client "one config" angle                             |
| **Pointer.io**                                    | editor submission                | Founder essay: "the MCP context-window tax"                     |
| **Cooperpress** (Node Weekly / JavaScript Weekly) | cooperpress.com suggestion form  | npm CLI release + calculator                                    |
| **Changelog News**                                | changelog.com/submit             | OSS + the data story                                            |

**Submission blurb (paste-ready):**

> **mcpfold** — a free, MIT-licensed CLI that manages your MCP (Model Context Protocol) config from
> one file and folds it out to every client (Claude, Cursor, VS Code, Windsurf, Zed, +13 more),
> loading only the tools each agent needs so you stop paying the context-window tax. Includes a free
> in-browser [MCP token calculator](https://mcpfold.com/mcp-token-calculator). Local-first, no
> account. https://mcpfold.com

---

## X / Twitter — build in public

The MCP / AI-coding community lives here; this is the most underused channel. Post consistently, reply
to MCP threads, share data. Two anchor posts:

### Anchor 1 — the calculator (utility, shareable)

> Your MCP servers are quietly spending thousands of tokens on tool schemas every single turn —
> whether the agent uses those tools or not.
>
> I built a free calculator so you can see your own number (runs in your browser, nothing uploaded):
> mcpfold.com/mcp-token-calculator
>
> Most setups are shocking. 🧵

Follow-ups in the thread: the 200K-window share stat, the before/after of curating to the tools you
actually use, and how mcpfold does it deterministically across every client.

### Anchor 2 — "I measured the MCP tax" (data journalism)

> "MCP wastes tokens" is a vibe. I wanted the number.
>
> So I benchmarked it: [N] servers, [M] tools, and how much of a 200K context window the tool
> schemas eat before you type a word. Full method + reproducible script 👇

Then: the table, the honest comparison of every fix (native tool-search, compression, code mode,
curation), and where each fits — link the pillar page. **Being the neutral map is what gets shared and
cited.**

### Reply-guy targets (genuinely helpful, not spammy)

Search X for: "MCP too many tools", "MCP context window", "Cursor 40 tool", "disable MCP servers".
Reply with the calculator + a one-line honest tip. No hard pitch.

---

## LinkedIn — the team / buyer angle

Revenue is the team cloud, and that buyer isn't on r/mcp. Post the **config-as-code** story here.

> Every AI coding tool your team uses — Claude Code, Cursor, VS Code, Copilot — keeps its own MCP
> config, in its own format, with secrets pasted into plaintext JSON. That drifts, and it leaks keys.
>
> We commit one canonical config to the repo and run `mcpfold sync --check` in CI: it fails the build
> when any checkout drifts, and secrets stay as references that resolve at launch — never written to
> disk. Config-as-code for MCP, no backend required.
>
> Free and MIT: https://mcpfold.com · the how: https://mcpfold.com/compare/reduce-mcp-token-usage

---

## Reddit — answer, never spam

Subs: **r/mcp, r/ClaudeAI, r/cursor, r/LocalLLaMA**. Don't post launches; _reply_ to live "too many
tools / context / slow" threads with the four-approach summary and the calculator link, disclose
you're the author, and follow each sub's self-promo rule. One genuinely useful comment > ten posts.

---

## Cross-post the data piece

Publish the "I measured the MCP tax" writeup on the blog, then syndicate with canonical tags to
**dev.to**, **Hashnode**, and **Medium**. Same content, four surfaces, one canonical URL — more
chances to be found and cited without duplicate-content risk.

---

## Podcasts & communities (MCP is hot — they want guests)

- Pitch dev-tool / AI-eng podcasts with the "MCP context tax, measured" angle (data > product).
- Be active in the **MCP community** (the modelcontextprotocol GitHub org / Discord): contribute,
  answer, and let the tool be discovered through participation rather than promotion.
