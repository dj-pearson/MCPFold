# Config format

The canonical file is `mcp.config.jsonc` — JSON with comments (`//` and `/* */`) and
trailing commas allowed. It is the single source of truth `mcpfold` folds out to every
client. This page is the reference; the format is generated from the zod source in
[`packages/core/src/schema.ts`](../packages/core/src/schema.ts), so it never drifts from
what the tool actually validates.

## Top level

```jsonc
{
  "$schema": "https://mcpfold.com/schema/v1.json",
  "version": 1,
  "servers": {/* name -> server */},
  "profiles": {/* name -> profile */},
}
```

| Field      | Type            | Required | Notes                                            |
| ---------- | --------------- | -------- | ------------------------------------------------ |
| `$schema`  | string          | no       | Editor autocomplete only; ignored semantically.  |
| `version`  | `1`             | **yes**  | Schema version. `mcpfold migrate` upgrades it.   |
| `servers`  | map of servers  | **yes**  | Keyed by a name you choose.                      |
| `profiles` | map of profiles | **yes**  | Keyed by a name you choose. May be empty (`{}`). |

Unknown top-level keys are rejected (the schema is strict), so typos surface immediately.

## Servers

A server is keyed by a name and describes how a client launches or connects to it.

```jsonc
"github": {
  "transport": "http",
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

| Field       | Type                             | Notes                                                             |
| ----------- | -------------------------------- | ----------------------------------------------------------------- |
| `transport` | `"stdio"` \| `"http"` \| `"sse"` | Required.                                                         |
| `command`   | string                           | Required for `stdio`. The executable (e.g. `npx`).                |
| `args`      | string[]                         | Arguments for a `stdio` command.                                  |
| `url`       | string (URL)                     | Required for `http`/`sse`.                                        |
| `auth`      | [auth object](#auth)             | Credentials for a remote server.                                  |
| `env`       | map of string \| secret ref      | Environment variables for a `stdio` command.                      |
| `pin`       | string                           | Pins an `@latest` stdio package to a fixed version at fold time.  |
| `tools`     | [tools filter](#tool-curation)   | Curates which tools this server exposes (the context saver).      |
| `tags`      | string[]                         | Labels used by profiles to decide what loads where. Default `[]`. |

`stdio` servers need a `command`; `http`/`sse` servers need a `url` — the schema enforces
this. Values in `env` and `auth.headers` may be a literal string **or** a
[secret reference](#secret-references).

### Auth

```jsonc
"auth": {
  "type": "bearer",              // "bearer" | "header" | "none" (default "none")
  "token": "${env:GITHUB_PAT}",  // a secret reference (never a raw token)
  "headers": {                    // optional extra headers; values may be refs
    "X-Org": "${env:ORG_ID}"
  }
}
```

`auth.token` must be a `${scheme:path}` reference — the schema rejects a raw literal there,
so a token can never be committed by accident.

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
[`packages/schema/mcp.config.schema.json`](../packages/schema/mcp.config.schema.json) and
is served from this docs site at the stable URL
`https://mcpfold.com/schema/v1.json`. A CI check fails if the committed copy drifts from
what the source generates, so the schema, this reference, and the validator can never
disagree.

## Versioning & migration

`version` is `1` today. When the format changes, `mcpfold migrate` upgrades an older file
in place (with a backup), and `loadConfig` refuses a file newer than the running CLI
understands — with an upgrade hint rather than a confusing parse error.
