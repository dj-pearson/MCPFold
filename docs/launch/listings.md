# mcpfold — launch & directory listing copy

Copy-paste-ready listing content for Product Hunt, Hacker News, Reddit, and the MCP directories.
Reuse the **canonical assets** below everywhere; platform sections only add what's platform-specific.

> **Positioning note:** mcpfold is a _management/proxy tool for MCP servers_, **not an MCP server
> itself**. Most MCP directories catalog servers — list mcpfold under their **tools / utilities /
> clients** sections, not the server catalog.

---

## Canonical assets (reuse everywhere)

| Field                               | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**                            | mcpfold                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **One-liner / tagline**             | Connect every MCP server without paying the context-window tax.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Short description** (~100 chars)  | One canonical MCP config, folded out to every client — loading only the tools each agent needs.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Medium description** (~250 chars) | mcpfold is a local-first CLI + proxy that curates your MCP servers. Write config once, fold it out to every client (Claude, Cursor, VS Code, Windsurf), load only the tools each agent needs, and resolve secret references instead of hardcoding keys.                                                                                                                                                                                                                                                                                         |
| **Long description**                | Every MCP server you connect dumps its full tool schema into your agent's context window on every turn — used or not. mcpfold's local proxy curates the toolset per client, cutting tool-schema tokens ~80% in a reproducible benchmark. You maintain one canonical config and fold it out to every client, resolving secret _references_ at sync time instead of hardcoding keys into a dozen config files. Local-first and private; free forever and MIT-licensed, with an optional self-hostable cloud for accounts, config sync, and teams. |
| **Website**                         | https://mcpfold.com                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Repo**                            | https://github.com/dj-pearson/MCPFold                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **npm**                             | https://www.npmjs.com/package/mcpfold                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Docs**                            | https://github.com/dj-pearson/MCPFold/tree/main/docs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **License**                         | MIT                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Author / maker**                  | Dan Pearson (Pearson Media)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

### Install one-liners

```
npm install -g mcpfold
npx mcpfold@latest init
brew install dj-pearson/tap/mcpfold
winget install PearsonMedia.mcpfold
docker run --rm ghcr.io/dj-pearson/mcpfold --help
```

### Keywords (master list)

`mcp` · `model context protocol` · `mcp server` · `mcp client` · `mcp proxy` · `ai` · `llm` ·
`ai agents` · `agent tools` · `context window` · `token optimization` · `developer tools` · `cli` ·
`claude` · `cursor` · `vs code` · `windsurf` · `secrets management` · `config management` ·
`local-first` · `open source`

---

## Product Hunt

| Field                   | Value                                                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**                | mcpfold                                                                                                                                                                               |
| **Tagline** (≤60 chars) | Connect every MCP server without the context-window tax                                                                                                                               |
| **Description** (short) | One canonical MCP config, folded out to every client — loading only the tools each agent needs, and resolving secret references instead of hardcoding keys. Local-first, open source. |
| **Topics / categories** | Developer Tools · Artificial Intelligence · Open Source · GitHub · Productivity                                                                                                       |
| **Links**               | Website: mcpfold.com · GitHub · npm                                                                                                                                                   |
| **Pricing**             | Free / Open Source                                                                                                                                                                    |

**First (maker) comment:**

> Hey Product Hunt 👋 I built mcpfold to fix something that bugged me about MCP: every server you
> connect dumps its _entire_ tool schema into your agent's context on every turn — whether the agent
> uses those tools or not. That's a silent tax on every request.
>
> mcpfold is a local-first CLI + proxy. You write one canonical config, and it folds out to every
> client (Claude Desktop, Cursor, VS Code, Windsurf…), curating the toolset per client so each agent
> only sees the tools it needs — ~80% fewer tool-schema tokens in a reproducible benchmark. It also
> resolves secret _references_ at sync time, so keys never get hardcoded across a dozen config files.
>
> Free forever, MIT-licensed. The optional cloud (sync, teams) is self-hostable. Would love your
> feedback — especially which clients/servers you'd want supported next.

**Gallery checklist:** logo (240×240+), the `init → import → sync → diff` demo GIF, a before/after
token-count chart, a "one config → many clients" diagram.

---

## Hacker News — Show HN

- **Title:** `Show HN: mcpfold – cut the MCP context-window tax with a per-client tool proxy`
- **URL:** https://github.com/dj-pearson/MCPFold
- **Body:**

> mcpfold is a local-first CLI + proxy for Model Context Protocol servers. Problem it solves: every
> connected MCP server injects its full tool schema into the model's context every turn, used or not.
> mcpfold curates the exposed toolset per client from one canonical config — ~80% fewer tool-schema
> tokens in the benchmark (link in repo). It also resolves secret references at sync time instead of
> hardcoding keys per client. MIT-licensed; optional self-hostable cloud for sync/teams. Happy to
> answer questions about the proxy design and how per-client curation is decided.

Post Tue–Thu, ~8–10am PT. Engage every comment; don't ask for upvotes.

---

## Reddit

- **Subreddits:** r/mcp, r/modelcontextprotocol, r/LocalLLaMA, r/ClaudeAI, r/cursor
- **Title:** `mcpfold: one MCP config folded out to every client, ~80% fewer tool-schema tokens (open source)`
- **Body:** lead with the context-window-tax problem, the per-client curation fix, the benchmark, and
  the install line. Be transparent that you're the author. Follow each subreddit's self-promo rules.

---

## MCP directories

For each: submit under **tools / utilities / clients**, not the server catalog.

| Directory                                                    | Where / how                                                    | Notes                                                                                                     |
| ------------------------------------------------------------ | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **awesome-mcp-servers** (punkpeye)                           | PR to the repo                                                 | Add under a Tools/Utilities/Frameworks section. Format: `[mcpfold](url) - <short description>`.           |
| **Glama** (glama.ai/mcp)                                     | Auto-indexes public GitHub MCP repos; claim/submit the listing | Ensure repo topics + description are set (done).                                                          |
| **PulseMCP** (pulsemcp.com)                                  | Submit via their "add" form                                    | Category: tooling/utility.                                                                                |
| **Smithery** (smithery.ai)                                   | Mostly hosted servers — verify fit                             | May not fit a CLI/proxy; list only if they accept tooling.                                                |
| **mcp.so**                                                   | Submit form                                                    | Tools/clients section.                                                                                    |
| **mcpservers.org**                                           | PR / submission                                                | Utilities section.                                                                                        |
| **Official MCP registry** (registry.modelcontextprotocol.io) | For MCP _servers_                                              | mcpfold is a proxy/tool, not a server — likely **not** a fit. Revisit only if it adds a tooling category. |

**Standard submission blurb (paste-ready):**

> **mcpfold** — Connect every MCP server without paying the context-window tax. A local-first CLI +
> proxy that curates the toolset per client from one canonical config (~80% fewer tool-schema tokens),
> and resolves secret references instead of hardcoding keys. MIT-licensed. https://mcpfold.com

---

## Categories by platform (quick reference)

| Platform      | Category/topic values                                                       |
| ------------- | --------------------------------------------------------------------------- |
| Product Hunt  | Developer Tools, Artificial Intelligence, Open Source, GitHub, Productivity |
| GitHub topics | `mcp`, `mcp-client`, `mcp-server`, `mcp-servers`, `mcp-tools` (already set) |
| npm keywords  | see each package's `keywords` (mcp, model-context-protocol, cli, proxy, …)  |
| Directories   | Tools · Utilities · Proxies · Clients                                       |
