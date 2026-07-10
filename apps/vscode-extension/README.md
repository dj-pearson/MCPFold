# mcpfold for VS Code

**Manage your MCP servers from one config — and stop paying the context-window tax — without leaving
your editor.**

[mcpfold](https://mcpfold.com) keeps one canonical config for your [Model Context Protocol](https://modelcontextprotocol.io)
servers and folds it out to every client (Claude, Cursor, VS Code, Windsurf, Zed, and more), loading
only the tools each agent needs and keeping secrets as references instead of hardcoded values. This
extension puts the CLI's everyday commands — and a live **drift indicator** — in your status bar.

## Features

- **One-click commands** — Sync, Preview changes (diff), Import from clients, Doctor, and Init, from
  the Command Palette or the status-bar menu.
- **Live sync status** — a status-bar item shows whether your MCP clients are in sync with your
  canonical config (✓ in sync / ⚠ drift), re-checked when you save a config file. It runs
  `mcpfold sync --check`, which writes nothing.
- **Token calculator** — jump to the free [MCP token calculator](https://mcpfold.com/mcp-token-calculator)
  to see what your servers cost you in context tokens.
- **Zero lock-in** — a thin front-end over the open-source `mcpfold` CLI. It never reimplements CLI
  behavior, so what you see here is exactly what `mcpfold sync` does.

## Requirements

The [`mcpfold` CLI](https://www.npmjs.com/package/mcpfold). The extension auto-detects a global
install, and otherwise falls back to `npx mcpfold@latest` (needs Node.js 20+). To install it globally:

```bash
npm install -g mcpfold
```

## Getting started

1. Open a folder that has (or will have) an `mcp.config.jsonc`.
2. Run **mcpfold: Init a config** from the Command Palette, then **mcpfold: Import servers from
   clients** to pull in what you already have.
3. Run **mcpfold: Sync to all clients**. Watch the status bar for drift from then on.

## Settings

| Setting                    | Default   | What it does                                                          |
| -------------------------- | --------- | --------------------------------------------------------------------- |
| `mcpfold.path`             | _(empty)_ | Path to the `mcpfold` binary. Empty = auto-detect (global, else npx). |
| `mcpfold.useNpx`           | `false`   | Always run via `npx mcpfold@latest`.                                  |
| `mcpfold.checkDriftOnSave` | `true`    | Re-check sync status when a config file is saved.                     |

## Links

- Website & docs: <https://mcpfold.com>
- Reduce MCP token usage: <https://mcpfold.com/compare/reduce-mcp-token-usage>
- Source (MIT): <https://github.com/dj-pearson/MCPFold>

## Contributing

Press **F5** in the `apps/vscode-extension` folder to launch the extension in a development host
(see [`.vscode/launch.json`](.vscode/launch.json)). The smoke-test checklist and Marketplace
publish runbook live in [`PUBLISHING.md`](PUBLISHING.md).

---

mcpfold is an independent, open-source project and is not affiliated with or endorsed by the MCP
project, Anthropic, or any client named here.
