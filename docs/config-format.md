# Config format

The canonical file is `mcp.config.jsonc` — JSON with comments (`//` and `/* */`) and
trailing commas allowed. It is the single source of truth `mcpfold` folds out to every
client. This page is the reference; the format is generated from the zod source in
[`packages/core/src/schema.ts`](../packages/core/src/schema.ts), so it never drifts from
what the tool actually validates.

## Top level

```jsonc
{
  "$schema": "https://mcpfold.com/schema/v2.json",
  "version": 2,
  "servers": {/* name -> server */},
  "profiles": {/* name -> profile */},
}
```

| Field      | Type            | Required | Notes                                                                           |
| ---------- | --------------- | -------- | ------------------------------------------------------------------------------- |
| `$schema`  | string          | no       | Editor autocomplete only; ignored semantically.                                 |
| `version`  | `2`             | **yes**  | Schema version. A v1 file auto-migrates on load; `mcpfold migrate` persists it. |
| `servers`  | map of servers  | **yes**  | Keyed by a name you choose.                                                     |
| `profiles` | map of profiles | **yes**  | Keyed by a name you choose. May be empty (`{}`).                                |

Unknown top-level keys are rejected (the schema is strict), so typos surface immediately.

## Servers

A server is keyed by a name and describes how a client launches or connects to it.

```jsonc
"github": {
  "transport": "streamable-http",
  "url": "https://api.githubcopilot.com/mcp/",
  "auth": { "type": "bearer", "token": "${env:GITHUB_PAT}" },
  "tags": ["work"]
},
"playwright": {
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@playwright/mcp@latest"],
  "pin": "1.4.2",
  "tags": ["code"]
}
```

| Field       | Type                                        | Notes                                                             |
| ----------- | ------------------------------------------- | ----------------------------------------------------------------- |
| `transport` | `"stdio"` \| `"streamable-http"` \| `"sse"` | Required. `"http"` is accepted as an alias for `streamable-http`. |
| `command`   | string                                      | Required for `stdio`. The executable (e.g. `npx`).                |
| `args`      | string[]                                    | Arguments for a `stdio` command.                                  |
| `url`       | string (URL)                                | Required for `streamable-http`/`sse`.                             |
| `auth`      | [auth object](#auth)                        | Credentials (or the `oauth` marker) for a remote server.          |
| `env`       | map of string \| secret ref                 | Environment variables for a `stdio` command.                      |
| `pin`       | string                                      | Pins an `@latest` stdio package to a fixed version at fold time.  |
| `tools`     | [tools filter](#tool-curation)              | Curates which tools this server exposes (the context saver).      |
| `tags`      | string[]                                    | Labels used by profiles to decide what loads where. Default `[]`. |

`stdio` servers need a `command`; remote servers need a `url` — the schema enforces this.
Values in `env` and `auth.headers` may be a literal string **or** a
[secret reference](#secret-references).

**Transports (v2).** The MCP spec's remote transport is **Streamable HTTP**; the older HTTP+SSE was
**deprecated on 2025-11-25**. So the canonical remote transport is `streamable-http` — a plain
`http` is accepted and canonicalized to it on load, and adapters render each client's own dialect
(Claude Code/VS Code emit `type: http`, Cursor a bare `url`, Gemini CLI `httpUrl`). `sse` still loads
and folds, but `mcpfold doctor` warns that it's deprecated.

### Auth

```jsonc
"auth": {
  "type": "bearer",              // "bearer" | "header" | "oauth" | "none" (default "none")
  "token": "${env:GITHUB_PAT}",  // a secret reference (never a raw token)
  "headers": {                    // optional extra headers; values may be refs
    "X-Org": "${env:ORG_ID}"
  }
}
```

`auth.token` must be a `${scheme:path}` reference — the schema rejects a raw literal there, so a
token can never be committed by accident.

**`oauth` (v2).** For a remote server that uses **client-native OAuth 2.1** — the client discovers
the resource/authorization server and holds the token itself — set `"auth": { "type": "oauth" }` with
**no** `token`/`headers`. It's a declarative marker (no secret material): adapters fold it to the
client's native OAuth shape where supported, and `doctor` won't push a token reference at it.

## Secret references

Anywhere a secret is expected, write a reference — never the value:

```
${scheme:path}
```

The scheme selects a provider; the path is provider-specific. Supported schemes:

| Scheme      | Example                           | Resolves from                   |
| ----------- | --------------------------------- | ------------------------------- |
| `env`       | `${env:GITHUB_PAT}`               | An environment variable.        |
| `dotenv`    | `${dotenv:GITHUB_PAT}`            | A designated `.env` file.       |
| `infisical` | `${infisical:dev/mcp/GITHUB_PAT}` | Infisical (machine identity).   |
| `keychain`  | `${keychain:mcp/github}`          | The OS keychain / secret store. |
| `op`        | `${op:vault/item/field}`          | 1Password (`op` CLI).           |

References are resolved to values only at fold time, in memory, and never written to a
client file under the default strategy. See [Secrets](./secrets.md) for provider setup and
the three storage strategies (`shim`, `native-input`, `inline`).

## Tool curation

The context-window saver. Restrict a server to just the tools you use:

```jsonc
"tools": {
  "mode": "allow",                 // "allow" or "deny"
  "list": ["search_code", "get_file_contents", "create_pull_request"]
}
```

`allow` exposes only the listed tools; `deny` exposes everything except them. The local
proxy applies the filter at `tools/list` time, so the client only ever sees the curated
set — see the [benchmark](./benchmark.md) for the ~80% token reduction this buys.

Curation is **not stdio-only**. A remote (`streamable-http`/`sse`) server is filtered too: `mcpfold
run` composes the proxy over the `mcp-remote` bridge's stdio (proxy → mcp-remote → remote), so a
curated remote server's client-visible `tools/list` is the curated set, with audit logging and
tool-definition pinning working identically. A native remote transport (no bridge) remains future
work; until then a bridge-spawn or remote-connection failure surfaces through the bridge's own output
and a nonzero exit.

### Seeing what a server actually costs (`mcpfold inspect`)

`mcpfold inspect [server]` opens a real MCP session to a configured server (secrets resolved in
memory, never printed), lists its tools, and reports how many tools and roughly how many tokens each
one adds to context — using the same 1-token-≈-4-characters method as the
[benchmark](./benchmark.md):

```bash
mcpfold inspect                    # every server in the config
mcpfold inspect github             # just one server
mcpfold inspect --json             # machine-readable envelope
```

Each run caches a **redacted** surface snapshot per user — tool names and token estimates only, never
a secret value or a tool-call payload. `mcpfold curate` reads that snapshot so it can report
"allowed but never used" tools for `deny`-mode and directive-less servers too, not just `allow` lists.

### Recommending a tool list from usage (`mcpfold curate`)

You don't have to guess which tools to allow. When a server runs through the proxy with an
audit log enabled (`mcpfold run <server> --audit-log <path>`, or the `MCPFOLD_AUDIT_LOG`
environment variable), every `tools/call` is recorded (redacted — names and argument _shapes_
only, never values). `mcpfold curate` reads that log and reports, per server, which tools you
actually use and the minimal `allow` list that would have covered them:

```bash
mcpfold curate                     # report every server with recorded usage
mcpfold curate github              # just one server
mcpfold curate --since 30 --min-calls 2   # last 30 days, ignore one-off calls
mcpfold curate --json              # machine-readable envelope
```

Apply the recommendation straight to your canonical config (comments and formatting are
preserved):

```bash
mcpfold curate --write             # diff, confirm, then update the `tools` directives
mcpfold curate --write --yes       # skip the confirmation
mcpfold curate --dry-run           # preview the diff and resulting file; write nothing
```

Only tools that were successfully invoked are recommended — a call that was _denied_ by an
existing directive is never added back. Re-running `--write` with no change in usage is a
no-op. When an audit log is configured, `mcpfold doctor` also nudges you toward `curate` for
any server that has recorded usage but no `tools` directive yet.

## Profiles

A profile decides which servers load into which client, at which scope. This is the
"fold": a profile's `include` tags are intersected against each server's `tags`.

```jsonc
"work": {
  "client": "cursor",         // one of the six client ids
  "scope": "user",             // "user" | "project" | "workspace"
  "path": "./project/.cursor", // required for project/workspace scope
  "include": ["work", "code"]  // only servers tagged work OR code load here
}
```

| Field     | Type                                     | Notes                                                                   |
| --------- | ---------------------------------------- | ----------------------------------------------------------------------- |
| `client`  | client id                                | `claude-desktop`, `claude-code`, `cursor`, `vscode`, `windsurf`, `zed`. |
| `scope`   | `"user"` \| `"project"` \| `"workspace"` | Default `"user"`.                                                       |
| `path`    | string                                   | Required when scope is `project` or `workspace`.                        |
| `include` | string[]                                 | Tag filter; a server loads if its tags intersect this.                  |

## JSON schema

The format is published as a JSON Schema, generated from the same zod source this page
documents:

```bash
pnpm --filter @mcpfold/schema generate
```

The committed schema lives at
[`packages/schema/mcp.config.schema.json`](../packages/schema/mcp.config.schema.json) and is served
from this docs site at the stable URL `https://mcpfold.com/schema/v2.json` (the previous
`/schema/v1.json` still resolves, so older `$schema` pointers keep working). A CI check fails if the
committed copy drifts from what the source generates, so the schema, this reference, and the
validator can never disagree.

## Versioning & migration

The canonical format is **version 2** (S17.5). A v1 file **auto-migrates in-memory on load**, so it
keeps working unchanged; running `mcpfold migrate` **persists** the upgrade to disk (with a backup).
The v1→v2 migration is lossless — it canonicalizes the remote transport `http` → `streamable-http`
(identical wire semantics) and leaves everything else untouched. `loadConfig` refuses a file _newer_
than the running CLI understands, with an upgrade hint rather than a confusing parse error.

## Relationship to `.mcp.json`

mcpfold's canonical file is `mcp.config.jsonc` — a neutral **superset** that adds profiles,
tags, and secret references the flat `.mcp.json` can't express. `.mcp.json` is the ecosystem's
emerging lingua franca (Claude Code writes it; Visual Studio reads it), so mcpfold treats it
first-class **at the edges**: `mcpfold import` reads one, and `mcpfold export --mcp-json` writes
one. You keep the rich source of truth; the flat file is how mcpfold interoperates with everything
that speaks `.mcp.json`. The full decision record is at `docs/adr/mcp-json-interop.md`.

- **Import** — a bare `.mcp.json` in the working directory is adopted as a first-class source
  (tag + profile `mcp-json`), alongside your installed clients' own configs. `${VAR}` env
  interpolation is normalized to a canonical `${env:VAR}` ref.
- **Export** — `mcpfold export --mcp-json` renders every server (or one `--profile`) to a flat
  `.mcp.json`. Secret refs are preserved as env interpolation where possible (`${env:NAME}` →
  `${NAME}`); refs to schemes a plain `.mcp.json` can't resolve (`infisical`, `op`, `keychain`,
  `dotenv`) are left verbatim and reported, so a secret is never silently downgraded to a value.
- **Canonical is never `.mcp.json`.** mcpfold reads/writes `mcp.config.jsonc`, so there is no
  collision with the file Claude Code and Visual Studio already target.

Round-tripping `export --mcp-json` → `import` is lossy only where the flat format is inherently
poorer: profiles collapse into a single `mcp-json` profile, and non-env secret schemes need
re-resolution. The rich structure lives in `mcp.config.jsonc`.
