# mcpfold

**One source of truth for your MCP servers.** Write it once, _fold_ it out to every
client — secrets never hardcoded, only the tools you need loaded.

> Status: ground-floor build. The canonical [`mcp.config.jsonc`](./docs) format, the
> local-first CLI wedge, and (later) the cloud sync layer are being built story-by-story
> from [`prd.json`](./prd.json).

## Why

MCP config sprawls across clients (Claude Code, Cursor, VS Code, Windsurf, Zed, …).
The formats have quietly diverged (VS Code uses root key `servers`, Zed uses
`context_servers`, everyone else uses `mcpServers`), secrets get hardcoded into
plaintext JSON, and tool schemas eat the context window. `mcpfold` keeps one canonical
file and folds it out to each client — resolving secret _references_ (never values) and
curating which servers and tools each client loads.

## Monorepo layout

| Package             | Purpose                                                                        |
| ------------------- | ------------------------------------------------------------------------------ |
| `packages/core`     | `@mcpfold/core` — pure, **I/O-free** engine: schema, resolution, drift, diff.  |
| `packages/adapters` | `@mcpfold/adapters` — one module per client (render native ↔ parse canonical). |
| `packages/secrets`  | `@mcpfold/secrets` — env / dotenv / infisical / keychain / 1Password.          |
| `packages/proxy`    | `@mcpfold/proxy` — local MCP proxy for tool-level curation.                    |
| `packages/cli`      | `mcpfold` — the CLI binary (`init`/`import`/`sync`/`diff`/`doctor`/…).         |
| `packages/schema`   | Published JSON Schema for `mcp.config.jsonc`.                                  |
| `apps/web`          | React/TS visual editor + directory (Cloudflare Pages).                         |
| `services/edge`     | Deno Supabase edge functions (auth, push, pull).                               |

**Core purity** is enforced: `packages/core` may not import `node:fs`, `node:os`,
`node:path`, or any network/process library. All I/O is injected through
`ClientAdapter` / `SecretProvider`. Guarded by an ESLint `no-restricted-imports` rule
and the `scripts/check-core-purity.mjs` CI gate.

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

CI runs `verify_all` on a Windows/macOS/Linux × Node 20 matrix — path resolution is
central to this product, so the cross-OS matrix is non-negotiable.

## Editor autocomplete (JSON Schema)

Add a `$schema` line to the top of your `mcp.config.jsonc` for autocomplete and inline
validation in editors that support it:

```jsonc
{
  "$schema": "https://mcpfold.com/schema/v1.json",
  "version": 1,
  // …
}
```

`mcpfold init` writes this line for you. The schema is generated from the zod source
(`packages/schema`) and a CI check fails if the committed
[`mcp.config.schema.json`](./packages/schema/mcp.config.schema.json) drifts from it —
regenerate with `pnpm --filter @mcpfold/schema generate`.

## Autonomous build loop

This project is built story-by-story from [`prd.json`](./prd.json). The loop harness
lives in [`ralph/`](./ralph): [`PROMPT.md`](./ralph/PROMPT.md) is the driver,
[`PROGRESS.md`](./ralph/PROGRESS.md) is the append-only log, and
[`AGENT_NOTES.md`](./ralph/AGENT_NOTES.md) records cross-cutting decisions. Each iteration
picks the highest-priority `todo` story whose dependencies are all `done`, implements it,
runs `verify_all`, and appends a completion line. Run a loop with:

```bash
while :; do claude -p ralph/PROMPT.md || break; done
```

State lives entirely on disk (story `status` in `prd.json` + `PROGRESS.md`), so a fresh
loop resumes without redoing completed work.

## License

MIT for `packages/*` core + CLI. The cloud layer (`apps/web`, `services/edge`) is
commercial/closed. See [`prd.json`](./prd.json) `meta.license`.
