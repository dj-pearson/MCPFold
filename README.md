<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/logo-readme-dark.png" />
    <img src="./assets/logo-readme-light.png" alt="mcpfold" width="380" />
  </picture>
</h1>

<p align="center">
  <strong>Connect every MCP server without paying the context-window tax.</strong><br />
  One canonical config, folded out to every client — loading only the tools each agent needs,
  and resolving secret <em>references</em> instead of hardcoding values.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/mcpfold"><img alt="npm version" src="https://img.shields.io/npm/v/mcpfold?color=4F46E5&label=npm" /></a>
  <a href="https://www.npmjs.com/package/mcpfold"><img alt="downloads" src="https://img.shields.io/npm/dm/mcpfold?color=06B6D4" /></a>
  <a href="https://github.com/dj-pearson/MCPFold/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/dj-pearson/MCPFold/ci.yml?branch=main&label=CI" /></a>
  <a href="./LICENSE"><img alt="license" src="https://img.shields.io/badge/license-MIT-green" /></a>
  <img alt="node" src="https://img.shields.io/node/v/mcpfold" />
</p>

<p align="center">
  <img src="./docs/assets/demo.svg" alt="mcpfold demo: init → import → sync → diff, cutting tool-schema tokens ~80%" width="820" />
</p>

<sub>Demo regenerated from the real CLI with `pnpm demo:record` (an [asciinema cast](./demo/mcpfold.cast) + this SVG; a GIF renders in CI via [`demo/mcpfold.tape`](./demo/mcpfold.tape)). Server names shown are examples — no endorsement implied.</sub>

> **v1.0.0 is live.** The local-first CLI + core are stable and **free forever, MIT-licensed** —
> install below. The optional hosted cloud (accounts, config sync, teams) is self-hostable. Full docs
> live in [`docs/`](./docs/index.md); the story-by-story build history is in [`prd.json`](./prd.json).

---

## Why mcpfold

### The context-window tax

Every MCP server you connect dumps its full tool schema into your agent's context window on every
turn — used or not. `mcpfold`'s local proxy curates the toolset per client. In a
[reproducible benchmark](./docs/benchmark.md) — github (20 tools), supabase (15), playwright (10),
**45 tools** total — curating down to the **9** actually needed cuts tool-schema tokens by **~80%**
(7,476 → 1,497), with no extra config because the shim already in the launch path does the filtering.

### …and one config for every client

MCP config sprawls across clients (Claude Code, Cursor, VS Code, Windsurf, Zed, …), and the formats
have quietly diverged: VS Code uses the root key `servers`, Zed uses `context_servers`, everyone else
uses `mcpServers`. Secrets get hardcoded into plaintext JSON. `mcpfold` keeps one canonical file and
folds it out to each client — resolving secret _references_ (never values) and curating which servers
and tools each client loads.

- **One source of truth** — a commented [`mcp.config.jsonc`](./docs/config-format.md), version-safe
  and editor-validated.
- **Secret-safe** — configs carry `${scheme:path}` references; resolved values never touch disk.
- **Fewer tokens** — per-client, per-agent tool curation via a local proxy.
- **Portable** — deterministic, byte-stable output for every client format.

---

## Install

Every channel resolves to the **same version** for a given release (a CI check enforces parity), so
mix them across machines. Full details in [docs/install.md](./docs/install.md).

**npm / npx** — no install needed to try it:

```bash
npx mcpfold init
npm install -g mcpfold      # or: pnpm add -g mcpfold   (installs `mcpfold` + the `mcpf` alias)
```

**Homebrew** (macOS / Linux):

```bash
brew install dj-pearson/tap/mcpfold
```

**Scoop** (Windows):

```powershell
scoop bucket add mcpfold https://github.com/dj-pearson/scoop-bucket
scoop install mcpfold
```

**curl \| sh** (macOS / Linux) — standalone binary, no Node, checksum-verified:

```bash
curl -fsSL https://mcpfold.com/install.sh | sh
```

**Standalone binary** — download for your platform from the
[latest release](https://github.com/dj-pearson/MCPFold/releases/latest) (macOS arm64/x64, Linux
x64/arm64, Windows x64), verify the `.sha256`, and put it on your `PATH`.

```bash
mcpfold --version
```

---

## Quickstart

Requires **Node 20+** (for the npm/npx install; the binaries need nothing). `mcpfold` auto-detects
whichever MCP clients you have installed.

```bash
mcpfold init      # 1. scaffold a commented mcp.config.jsonc (+ $schema for editor autocomplete)
mcpfold import    # 2. scan installed clients and merge their servers into the canonical file
mcpfold sync      # 3. fold the canonical config out to every detected client (native formats)
mcpfold diff      # preview what sync would change, per client, before applying
mcpfold doctor    # health-check config, clients, and secret references
```

Other commands: `secret` (manage secret references), `run` (launch the curating proxy), `status`,
`add`. See the full [Quickstart](./docs/quickstart.md) and [command reference](./docs/index.md).

### Supported clients

Claude Code · Claude Desktop · Cursor · VS Code · Windsurf · Zed — `mcpfold` reads and writes each
one's native format from a single source of truth. (New adapters are a
[one-PR on-ramp](./CONTRIBUTING.md).)

### Editor autocomplete (JSON Schema)

`mcpfold init` adds a `$schema` line so editors give you autocomplete + inline validation:

```jsonc
{
  "$schema": "https://mcpfold.com/schema/v1.json",
  "version": 1
  // …
}
```

The schema is generated from the zod source (`packages/schema`); a CI check fails if the committed
[`mcp.config.schema.json`](./packages/schema/mcp.config.schema.json) drifts — regenerate with
`pnpm --filter @mcpfold/schema generate`.

---

## How it's built

| Package             | Purpose                                                                        |
| ------------------- | ------------------------------------------------------------------------------ |
| `packages/core`     | `@mcpfold/core` — pure, **I/O-free** engine: schema, resolution, drift, diff.  |
| `packages/adapters` | `@mcpfold/adapters` — one module per client (render native ↔ parse canonical). |
| `packages/secrets`  | `@mcpfold/secrets` — env / dotenv / infisical / keychain / 1Password.          |
| `packages/proxy`    | `@mcpfold/proxy` — local MCP proxy for tool-level curation.                    |
| `packages/cli`      | `mcpfold` — the CLI binary (`init`/`import`/`sync`/`diff`/`doctor`/…).         |
| `packages/schema`   | Published JSON Schema for `mcp.config.jsonc`.                                  |
| `apps/web`          | React/TS visual editor + directory (Cloudflare Pages).                         |
| `services/edge`     | Deno edge service — device-code auth, config push/pull, teams.                 |

**Core purity** is enforced: `packages/core` may not import `node:fs`, `node:os`, `node:path`, or any
network/process library. All I/O is injected through `ClientAdapter` / `SecretProvider`. Guarded by an
ESLint `no-restricted-imports` rule and the `scripts/check-core-purity.mjs` CI gate.

## Development

Requires **Node 20+** and **pnpm 10+** (`corepack enable`).

```bash
pnpm install          # install workspace deps
pnpm lint             # eslint + core-purity check
pnpm typecheck        # tsc --noEmit across packages
pnpm test             # vitest (unit + fixture snapshots)
pnpm -r build         # build every package
pnpm verify_all       # lint + typecheck + test + build (the full gate)
```

CI runs `verify_all` on a Windows/macOS/Linux × Node 20 matrix — path resolution is central to this
product, so the cross-OS matrix is non-negotiable. New client adapters, secret providers, and
`doctor` checks are especially welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Pricing, funding & roadmap

The CLI and everything local are **free forever and MIT-licensed**; the hosted cloud is the paid
surface (and you can self-host it yourself for free). See the [pricing model](./docs/pricing-model.md),
the public [roadmap](./docs/roadmap.md), and how the project is run in [governance](./docs/governance.md).

## Support the project

If mcpfold saves you time, you can help fund ongoing work:

- **Recurring** — [GitHub Sponsors](https://github.com/sponsors/dj-pearson)
  or [Open Collective](https://opencollective.com/mcpfold)
- **One-time** — [donate via Stripe](https://buy.stripe.com/9B600l5BR6KF1YV01s1Fe00)

Sponsorships fund the free, open-source core. Thank you 🙏

## License

MIT for `packages/*` core + CLI. The cloud layer (`apps/web`, `services/edge`) is commercial/closed.
See [`prd.json`](./prd.json) `meta.license`.
