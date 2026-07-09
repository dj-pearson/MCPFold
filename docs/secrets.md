# Secret providers

mcpfold resolves `${scheme:path}` references at fold/launch time — the value is **never**
written to a client config (shim/native-input) unless you explicitly choose the gitignored
`inline` strategy. Resolution is [fail-closed](./offline-contract.md).

Register order (spec §6): `env` → `dotenv` → `infisical` → `keychain` → `op`. All are
enabled by default; a provider that needs configuration fails with an actionable message at
resolve time, not before.

| Scheme      | Reference example                 | Setup required                                                           |
| ----------- | --------------------------------- | ------------------------------------------------------------------------ |
| `env`       | `${env:GITHUB_PAT}`               | Export the variable in your shell. Nothing else.                         |
| `dotenv`    | `${dotenv:GITHUB_PAT}`            | Put `GITHUB_PAT=…` in `<cwd>/.env` (gitignore it). `mcpfold secret set`. |
| `infisical` | `${infisical:dev/mcp/GITHUB_PAT}` | See below.                                                               |
| `keychain`  | `${keychain:github}`              | OS keychain (below).                                                     |
| `op`        | `${op:vault/item/field}`          | 1Password `op` CLI (below).                                              |

## Infisical (`infisical`)

Reference grammar: `env/[folder/…/]KEY` — the first segment is the environment slug, the
last is the secret key, the middle is the folder path
(`dev/mcp/GITHUB_PAT` → env `dev`, path `/mcp`, key `GITHUB_PAT`).

Authenticate with a **machine identity / service token** from the environment — never
hardcoded:

```bash
export INFISICAL_TOKEN="st.xxxx"          # machine-identity / service token
export INFISICAL_PROJECT_ID="proj_xxxx"
export INFISICAL_API_URL="https://app.infisical.com"   # or your self-hosted URL
```

## OS keychain (`keychain`)

Resolves `${keychain:<account>}` under the service name `mcpfold`:

- **macOS** — Keychain via `security` (built in). Store: `security add-generic-password -s mcpfold -a github -w`.
- **Linux** — libsecret via `secret-tool`. Store: `secret-tool store --label=mcpfold service mcpfold account github`.
- **Windows** — Credential Manager via the PowerShell `CredentialManager` module
  (`Install-Module CredentialManager`).

Or store with `mcpfold secret set` where supported.

## 1Password (`op`)

Resolves `${op:vault/item/field}` via `op read op://vault/item/field`. Requires the
[`op` CLI](https://developer.1password.com/docs/cli) installed and signed in (`op signin`).
A missing or locked CLI produces an actionable error; secret values are never logged.

## Secret strategies (how a ref reaches the client)

Each adapter declares how it keeps the resolved **value** off disk:

| Strategy       | What lands in the client file                                  | Who resolves the value           |
| -------------- | -------------------------------------------------------------- | -------------------------------- |
| `shim`         | `mcpfold run <name>` launcher — no ref, no value               | mcpfold, at launch               |
| `native-input` | the client's own indirection (VS Code `${input:}` + `inputs`)  | the client prompts + stores it   |
| `native-env`   | the client's own env placeholder (`${env:NAME}` / `${NAME}` …) | the client, from its process env |
| `inline`       | the resolved **value** — only ever to a **gitignored** target  | mcpfold, at fold time            |

### `native-env` — fold `${env:NAME}` shim-free (S19.4)

For a plain `${env:NAME}` reference, the shim adds a wrapper process for nothing — many clients expand
env placeholders in their own config. `native-env` writes the client's **own** dialect instead, so the
client resolves the variable at launch and mcpfold stays out of the path. The value is never written —
only the placeholder name (e.g. `${env:NAME}`), which `mcpfold import` round-trips back to `${env:NAME}`.

Supported clients and their dialect (verified July 2026): Cursor / Windsurf `${env:NAME}`, Claude Code /
Gemini CLI / Warp / GitHub Copilot CLI `${NAME}`, opencode `{env:NAME}`. A **non-env** scheme
(`infisical`/`keychain`/`op`/`dotenv`) can't be resolved by the client, so that server automatically
falls back to the `shim` — `mcpfold doctor` prints an `info` line explaining which server and why.

**Opt in per profile or per server** (the default stays each adapter's own — no silent change):

```jsonc
{
  "servers": {
    "github": {
      "transport": "streamable-http",
      "url": "…",
      "auth": { "type": "bearer", "token": "${env:GITHUB_PAT}" },
      "secretStrategy": "native-env",
      "tags": ["work"],
    },
  },
  "profiles": {
    // …or set it for the whole fold; a server's own secretStrategy still wins.
    "cursor": {
      "client": "cursor",
      "scope": "user",
      "include": ["work"],
      "secretStrategy": "native-env",
    },
  },
}
```

The suite-wide leak harness proves `native-env` writes zero secret **values** across every supporting
client — the placeholder name is all that ever reaches disk.
