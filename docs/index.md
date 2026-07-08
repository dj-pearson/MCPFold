# mcpfold

**Connect every MCP server without paying the context-window tax.** `mcpfold` keeps one
canonical config and folds it out to every client — loading only the tools each agent
actually needs, and resolving secret _references_ instead of hardcoding values.

## The context-window tax

Every MCP server you connect dumps its full tool schema into your agent's context window
on every turn — whether the agent uses those tools or not. Connect a handful of busy
servers and tool-schema JSON alone can eat thousands of tokens before you've typed a word.

`mcpfold`'s local proxy curates the toolset per client. In the
[reproducible benchmark](./benchmark.md) — github (20 tools), supabase (15), playwright
(10), 45 tools total — curating down to the 9 tools actually needed cuts tool-schema
tokens by **~80%**:

| Servers                  | Tools | Tool-schema tokens |
| ------------------------ | ----: | -----------------: |
| Raw (connect everything) |    45 |              7,476 |
| Curated (`mcpfold`)      |     9 |              1,497 |

No extra config: the shim already in the launch path does the filtering. See
[the benchmark](./benchmark.md) for method and per-server numbers.

## …and one config for every client

The formats have quietly diverged — VS Code uses the root key `servers`, Zed uses
`context_servers`, everyone else uses `mcpServers` — and secrets get hardcoded into
plaintext JSON. `mcpfold` keeps one canonical [`mcp.config.jsonc`](./config-format.md) and
folds it out to each client:

- **Eight clients today** — Claude Code, Claude Desktop, Cursor, VS Code, Windsurf, Zed,
  Cline, Gemini CLI — each an [adapter you can add in one PR](./adapters.md).
- **Secrets never on disk** — the config carries `${scheme:path}` [references](./secrets.md),
  resolved at launch from env / dotenv / Infisical / your OS keychain / 1Password. The
  default `shim` strategy keeps even the reference off the client file.
- **Drift you can gate on** — `mcpfold diff` and `sync --check` exit nonzero when a client
  file has drifted, so "is everything in sync?" is one CI-friendly command.

## Get started

```bash
npm install -g mcpfold
mcpfold init        # scaffold mcp.config.jsonc, detect installed clients
mcpfold import      # adopt what your clients already have
mcpfold sync        # fold the canonical config out to every client
```

The full walkthrough is in the [Quickstart](./quickstart.md).

## Documentation

- **[Quickstart](./quickstart.md)** — install → init → import → sync → diff in five minutes.
- **[Config format](./config-format.md)** — the canonical `mcp.config.jsonc` reference.
- **[Secrets](./secrets.md)** — references, providers, and the three storage strategies.
- **[Adapters](./adapters.md)** — add a new client in one PR.
- **[Benchmark](./benchmark.md)** — the context-window measurement, reproduced.
- **[CLI contract](./cli-contract.md)** — exit codes, `--json` envelope, redaction.
- **[Offline contract](./offline-contract.md)** — fail-closed behavior when providers are down.
- **[Deployment runbook](./deployment.md)** — zero-to-running for the whole stack: Cloudflare Pages, Supabase, edge service, npm, DNS, and the full env matrix.
- **[Self-hosting](./self-hosting.md)** — deploy the optional cloud (Supabase + Coolify).
- **[CI](./ci.md)** — the cross-OS matrix and branch-protection setup.

## JSON schema

The canonical config format is published as a JSON Schema at a stable URL:

```
https://mcpfold.com/schema/v1.json
```

`mcpfold init` writes a `$schema` line pointing at it, so editors that understand JSON
Schema give you autocomplete and inline validation for free. The schema is
[generated from the zod source](./config-format.md#json-schema) and served from this docs
site.
