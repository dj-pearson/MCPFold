# Homepage copy — SEO/GEO draft

Reference copy for **S15.3** (homepage on-page SEO) and **S15.1/S15.2** (prerender +
FAQ schema). Focus keyword: **`MCP config`**. Category term to own: **`MCP config manager`**.
Primary tagline: **One config for every MCP client.** Keep all numbers sourced from the
committed benchmark (S5.4/S13.2) — do not hardcode figures that can drift.

Supported clients (keep this list current with the adapter registry): Claude Code,
Claude Desktop, Cursor, VS Code, Windsurf, Zed, Cline, Gemini CLI.

---

## `<title>` (≤ 60 chars)

```
mcpfold — one MCP config for every client
```

## Meta description (≤ 155 chars)

```
Manage MCP servers from one config file and fold it out to every client. Curate tools to cut context, keep secrets as references. Open source, local-first.
```

## H1

```
One MCP config for every client.
```

## Hero subhead (keep the brand line — it already tests well)

```
Connect every MCP server without paying the context-window tax.
```

## First ~100 words (SEO/GEO-critical opening — must appear in prerendered HTML)

> **mcpfold is an open-source MCP config manager.** Write one canonical `mcp.config.jsonc`
> and fold it out to every MCP client — Claude Code, Claude Desktop, Cursor, VS Code,
> Windsurf, Zed, Cline, and Gemini CLI — instead of hand-editing a different file and root
> key for each. mcpfold curates which servers and tools each client loads, so you stop
> paying the context-window tax: in a reproducible benchmark, trimming 45 tools down to the
> 9 actually needed cut tool-schema tokens by ~80%. Secrets stay references, never values.
> Run `npx mcpfold init`, import your existing configs, and sync.

Rationale: the opening names the focus keyword (_MCP config manager_), _MCP servers_, every
_MCP client_ by name (the client-keyword net), the token-savings proof, the secrets promise,
and the entry command — all in the first paragraph, which crawlers and LLMs weight heavily.

---

## Below-fold H2 sections (each targets a keyword cluster)

### H2: Manage every MCP server from one file

One canonical config is the source of truth. Add a server once; `mcpfold sync` writes it to
every client in the right format. `mcpfold diff` shows drift; `mcpfold import` reverse-folds
the configs you already have.
_Targets: manage MCP servers, MCP config, MCP server setup, add MCP server, mcpServers json._

### H2: Works with every MCP client

mcpfold speaks each client's native format — including the traps: VS Code uses the root key
`servers`, Zed uses `context_servers`, everyone else uses `mcpServers`. Render this list as
real links to the per-client guides (S15.5): Claude Code, Claude Desktop, Cursor, VS Code,
Windsurf, Zed, Cline, Gemini CLI.
_Targets: cursor mcp, claude code mcp, claude mcp, vs code mcp, windsurf mcp, zed mcp,
claude desktop mcp config._

### H2: Curate tools, cut context

Every server you connect dumps its full tool schema into context on every turn — used or
not. mcpfold's local proxy trims `tools/list` to the allow/deny set per client. Link to the
benchmark writeup.
_Targets: mcp tools, mcp proxy, reduce token usage, too many mcp tools, context window._

### H2: Secrets stay references, never values

Tokens are stored as `${provider:path}` references and resolved at launch from env, dotenv,
Infisical, keychain, or 1Password — plaintext tokens never touch a git-tracked file.
_Targets: mcp secrets management._

### H2 (discovery hook): Browse the MCP server directory

A curated, indexable directory of MCP servers with an add-to-config snippet for each. Link
to /directory.
_Targets: best mcp servers, mcp server directory, mcp server list._

---

## FAQ block (extraction-friendly — ships with `FAQPage` JSON-LD, S15.2)

Each answer is self-contained (leads with the answer) so it can be lifted by a featured
snippet or an AI assistant.

**What is an MCP config manager?**
An MCP config manager keeps one canonical definition of your MCP servers and writes it out to
each client's native config file. mcpfold is an open-source, local-first MCP config manager
for Claude Code, Claude Desktop, Cursor, VS Code, Windsurf, Zed, Cline, and Gemini CLI.

**How do I manage MCP servers across multiple clients?**
Keep one canonical `mcp.config.jsonc`, then run `mcpfold sync` to fold it out to every client
in that client's format and location. `mcpfold import` pulls your existing scattered configs
into the canonical file to start; `mcpfold diff` shows where any client has drifted.

**Does mcpfold store my API tokens?**
No. Tokens are stored as `${provider:path}` references, never as values. mcpfold resolves them
at launch from env, dotenv, Infisical, the OS keychain, or 1Password, so plaintext secrets are
never written to a git-tracked file.

**How does mcpfold reduce context-window usage?**
Its local proxy curates each client's toolset, trimming `tools/list` to only the servers and
tools that client needs. In a reproducible benchmark, cutting 45 tools to the 9 needed reduced
tool-schema tokens by about 80% (7,476 → 1,497).

**Which MCP clients does mcpfold support?**
Claude Code, Claude Desktop, Cursor, VS Code, Windsurf, Zed, Cline, and Gemini CLI today, with
new clients added as adapters. Each speaks its native format, including divergent root keys
(`servers` in VS Code, `context_servers` in Zed).

**Is mcpfold free / open source?**
Yes. The core engine and CLI are MIT-licensed and local-first. `npx mcpfold init` to start.

---

## `SoftwareApplication` JSON-LD (homepage, S15.1)

Drop the actual URL/version from source; do not hardcode a version that can drift.

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "mcpfold",
  "applicationCategory": "DeveloperApplication",
  "operatingSystem": "macOS, Windows, Linux",
  "description": "Open-source MCP config manager: keep one canonical config and fold it out to every MCP client, curating tools to cut context-window usage. Secrets stay references, never values.",
  "url": "https://mcpfold.com",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
  "license": "https://opensource.org/license/mit"
}
```

## Internal-linking checklist (S15.3)

Homepage must link to: `/install`, `/directory`, each `/guides/<client>` (S15.5), and
`/glossary` (S15.6). Maintain the target term per page in `src/seo/keyword-map.ts`.
