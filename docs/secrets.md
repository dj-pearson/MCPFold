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
