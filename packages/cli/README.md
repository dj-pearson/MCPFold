<h1 align="center">
  <img src="https://raw.githubusercontent.com/dj-pearson/MCPFold/main/assets/logo-readme-light.png" alt="mcpfold" width="360" />
</h1>

<p align="center">
  <strong>Connect every MCP server without paying the context-window tax.</strong><br />
  One canonical config, folded out to every client — loading only the tools each agent needs,
  and resolving secret <em>references</em> instead of hardcoding values.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/mcpfold"><img alt="npm version" src="https://img.shields.io/npm/v/mcpfold?color=4F46E5&label=npm" /></a>
  <a href="https://www.npmjs.com/package/mcpfold"><img alt="downloads" src="https://img.shields.io/npm/dm/mcpfold?color=06B6D4" /></a>
  <a href="https://github.com/dj-pearson/MCPFold/blob/main/LICENSE"><img alt="license" src="https://img.shields.io/badge/license-MIT-green" /></a>
  <img alt="node" src="https://img.shields.io/node/v/mcpfold" />
</p>

---

## The context-window tax

Every MCP server you connect dumps its **full tool schema** into your agent's context window on
every turn — used or not. `mcpfold`'s local proxy curates the toolset per client, so each agent sees
only the tools it needs. In a [reproducible benchmark](https://github.com/dj-pearson/MCPFold/blob/main/docs/benchmark.md),
curating a typical multi-server setup cuts tool-schema tokens by **~80%**.

You write **one canonical config**, and `mcpfold` folds it out to every client (Claude Desktop,
Cursor, VS Code, Windsurf, and more) — resolving secret **references** at sync time instead of
hardcoding keys into a dozen client files.

## Install

```sh
# npm (cross-platform)
npm install -g mcpfold

# or run without installing
npx mcpfold@latest init

# macOS / Linux — Homebrew
brew install dj-pearson/tap/mcpfold

# Windows — WinGet
winget install PearsonMedia.mcpfold
# or Scoop
scoop bucket add mcpfold https://github.com/dj-pearson/scoop-bucket && scoop install mcpfold

# Docker
docker run --rm -v "$PWD:/work" ghcr.io/dj-pearson/mcpfold --help

# curl (standalone binary, no Node required)
curl -fsSL https://raw.githubusercontent.com/dj-pearson/MCPFold/main/scripts/install.sh | sh
```

## Quickstart

```sh
mcpfold init          # scaffold a canonical mcpfold config
mcpfold import        # pull in servers already configured in your clients
mcpfold sync          # fold the config out to every detected client
mcpfold diff          # preview what a sync would change, per client
mcpfold doctor        # diagnose config, clients, and secret references
```

`mcpf` is a shorter alias for `mcpfold`.

## Why mcpfold

- **Cut the token tax** — per-client tool curation trims schemas an agent never uses (~80% in the benchmark).
- **One source of truth** — edit config once; every client stays in sync.
- **Secret _references_, not values** — keep keys out of client config files; resolve them at sync time.
- **Local-first & private** — the CLI and proxy run entirely on your machine.
- **Free forever, MIT-licensed** — the optional hosted cloud (accounts, config sync, teams) is self-hostable.

## Docs

Full documentation lives in the repo: **https://github.com/dj-pearson/MCPFold** · site: **https://mcpfold.com**

## License

MIT © Pearson Media
