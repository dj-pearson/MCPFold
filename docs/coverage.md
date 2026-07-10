# Adapter coverage

Breadth is the moat. This is the living matrix of clients mcpfold folds to, plus how the roadmap is
prioritized. Adding a client is a one-PR job — see [Adapters](./adapters.md) and
`mcpfold scaffold-adapter <name>`.

> **Machine-verified evidence:** the [client compatibility matrix](./compat-matrix.md) (format ×
> scopes × transport × secret strategy × **last-verified date**) is generated from the compat
> harness — never hand-edited — and the harness re-checks each client's shape (and fetchable clients'
> upstream docs) weekly. See `.github/workflows/adapter-compat.yml`.

## Supported clients

| Client         | Config root        | Scopes        | Secret strategy | Restart on change | Remote transport                 |
| -------------- | ------------------ | ------------- | --------------- | ----------------- | -------------------------------- |
| Claude Code    | `mcpServers`       | user          | shim            | no                | native `type`+`url`              |
| Claude Desktop | `mcpServers`       | user          | shim            | **yes**           | shim (stdio-only)†               |
| Cursor         | `mcpServers`       | user, project | shim            | no                | native `url`                     |
| VS Code        | `servers`          | user, project | native input    | no                | native `type`+`url`              |
| Windsurf       | `mcpServers`\*     | user          | shim            | **yes**           | native `url`; shim if authed\*   |
| Zed            | `context_servers`  | user, project | shim            | no                | native `url`                     |
| Cline          | `mcpServers`       | user          | shim            | no                | native `url`                     |
| Gemini CLI     | `mcpServers`       | user, project | shim            | no                | native `httpUrl`/`url`           |
| JetBrains      | `mcpServers`       | user, project | shim            | no                | native `url`                     |
| Visual Studio  | `servers`\*\*      | user, project | native input    | no                | native `type`+`url`              |
| Continue       | `mcpServers`\*\*\* | user, project | shim            | no                | native `url`                     |
| Roo Code       | `mcpServers`       | user, project | shim            | no                | native `url`                     |
| Goose          | `extensions`‡      | user          | shim            | no                | native `uri` (`streamable_http`) |
| Codex CLI      | `mcp_servers`‡     | user          | shim            | no                | native `url`                     |
| LM Studio      | `mcpServers`       | user          | shim            | no                | native `url`                     |
| Warp           | `mcpServers`       | user, project | shim            | no                | native `url`                     |
| opencode       | `mcp`‡             | user, project | shim            | no                | native `url`                     |
| Copilot CLI    | `mcpServers`       | user          | shim            | no                | native `type`+`url`              |

**Remote transport (S17.2).** `mcp-remote` is explicitly transitional ("as soon as your client
supports remote, authorized servers, you can remove it"), so mcpfold folds a remote server to the
client's own native entry wherever it can and bridges with the pinned `mcp-remote` shim only for the
residue. Each adapter declares a `remote` capability (`nativeHttp`, `nativeOauth`, `fieldShape`); a
server is shimmed only when it is remote **and** the client either can't reach remotes at all
(`!nativeHttp`) or can't attach auth to a native remote entry (authenticated **and** `!nativeOauth`).
`mcpfold run`'s own remote connection likewise prefers a direct path where the CLI can — but the CLI
ships no built-in HTTP transport (that would add a heavy dependency and more attack surface), so it
falls back to the same pinned bridge.

† **Claude Desktop**'s `claude_desktop_config.json` is stdio-only (remotes go through the Connectors
UI, not the config file), so **every** remote server folds to the `mcp-remote` shim.

\* Windsurf can natively call an unauthenticated remote (`url`), but **can't attach auth to a native
remote entry**, so authenticated http/sse servers are rewritten to a `mcp-remote` stdio invocation
(reversible on import). The bridge is always pinned to a CVE-safe version (`mcp-remote@0.1.38`; floor
`0.1.16` fixes CVE-2025-6514) — never unpinned — and `mcpfold doctor` warns if it finds an unpinned
or vulnerable `mcp-remote` in a client config.

\*\* Visual Studio reads MCP config in the **VS Code dialect** (root key `servers` + a top-level
`inputs` array), so its adapter reuses the VS Code render/parse verbatim and only changes path
resolution — see the client-specific note below.

\*\*\* Continue's own config is YAML, but it also auto-loads any JSON MCP file dropped into a
`.continue/mcpServers/` directory (the documented migration path for Claude Desktop / Cursor /
Cline users), so mcpfold folds to a JSON file there with the standard `mcpServers` root — no YAML
dependency.

‡ **Shared config files (S19.2).** Goose (`config.yaml`), Codex CLI (`config.toml`), and opencode
(`opencode.json`) keep their MCP servers in a file that _also_ holds non-MCP client settings (model,
provider, theme, keyring…). These adapters therefore **merge** — they rewrite only the managed
server section and preserve every other key. Goose/opencode also preserve comments (via the
comment-aware YAML document / jsonc structural edit); TOML has no comment-preserving serializer we
depend on, so Codex CLI preserves unmanaged **keys** but not comments (the honest limit of "where
feasible"). Goose additionally preserves its own non-server extensions (`type: builtin | platform |
frontend | inline_python`) untouched. The YAML/TOML parse+serialize dependencies (`yaml`,
`smol-toml`) live in `packages/adapters` only — `packages/core` stays I/O- and parser-free.

Every adapter passes the shared cross-adapter matrix (render → committed golden + render → parse
round-trip) and the deterministic-serialization invariant.

### Client-specific notes (verified July 2026)

- **Claude Code** requires an explicit per-server `type` on remote entries (it errors on a remote
  entry with `url` but no `type`), so we always emit it; on import we also accept `streamable-http`
  as an alias for `http`.
- **Gemini CLI** distinguishes the two remote transports by key, not a `type` field:
  **`httpUrl`** for streamable HTTP and **`url`** for SSE (stdio uses `command`). We render and
  parse those keys explicitly.
- **Windsurf** has been absorbed into Devin/Cognition and its docs now redirect to
  `docs.devin.ai`. The MCP config path is unchanged (`~/.codeium/windsurf/mcp_config.json`), so the
  adapter still holds. A `devin` alias is **deferred** until a distinct Devin config surface exists —
  today it would be a duplicate of the Windsurf adapter with no behavioral difference.
- **Zed** does **not** require a restart (`needsRestart: false`) — consistent with the adapter,
  this table, and the spec. It supports **project scope** (S19.3): a project-local
  `.zed/settings.json` with the same `context_servers` schema overrides the user settings for that
  project (verified July 2026).
- **Gemini CLI** supports **project scope** (S19.3): a project-local `.gemini/settings.json` with
  the same `mcpServers` schema (`gemini mcp add` defaults to it; servers merge across levels by
  name, project winning). mcpfold folds to `~/.gemini/settings.json` (user) or
  `<project>/.gemini/settings.json` (project).

### Scopes & installed-app detection (S19.3)

**Project scope** is implemented for every client that documents a project-local MCP config:
Cursor, VS Code, JetBrains, Visual Studio, Continue, Roo Code, Warp, opencode, **Zed**, and
**Gemini CLI**. The remaining clients are **user-scope only** (verified July 2026) and now **throw**
on a project/workspace profile rather than silently writing it to the shared user file: **Claude
Desktop** (single global `claude_desktop_config.json`), **Windsurf** (single
`~/.codeium/windsurf/mcp_config.json`), **Cline** (MCP servers are global-only; the project
`.cline/` dir holds rules/hooks, not servers), **LM Studio**, **Goose**, **Codex CLI**, and
**Copilot CLI**. (For a project-scoped Anthropic target, that role is Claude _Code_'s `.mcp.json`,
not Claude _Desktop_.)

**Installed-app detection.** `detect-clients` used to report a client only when its MCP config file
already existed, so an installed-but-unconfigured client (the exact case `init --guided` serves) was
invisible. It now runs a second, injectable **app-presence probe** — a CLI on PATH, an app
bundle/install dir, a VS Code-family extension folder, or the durable dot-dir a client writes on
first run — and exposes a three-way state: `configured` (has an MCP config), `installed-only` (app
present, not yet configured), or `not-found`. `init --guided`, `status`, and `doctor` surface the
installed-only clients as fold targets; the `--json` envelope keeps its legacy `installed` field
(== `configured`) and adds `appPresent` + `state` additively. App-presence probing reads the real
machine (PATH, install dirs), so it varies by environment; set `MCPFOLD_NO_APP_DETECTION=1` to force
config-only detection for stable, scripted output (the demo recorder uses this).

- **JetBrains** (S19.1): JetBrains AI Assistant configures MCP via an in-IDE dialog that takes a
  `mcpServers`-shaped paste-in JSON (with "Import from Claude"), which does not persist to a stable
  user-editable file. The JetBrains _agent_ surface (Junie) reads the same `mcpServers` JSON from a
  documented on-disk file, so mcpfold folds to `~/.junie/mcp/mcp.json` (user) and
  `<project>/.junie/mcp/mcp.json` (project) — byte-identical to the JSON you would paste into the
  AI Assistant dialog. Secret strategy `shim` (the `mcp.json` surface has no native input
  indirection).
- **Visual Studio** (S19.1): VS reads MCP config in the VS Code dialect (root key `servers` +
  `inputs`) from several files in precedence order (`%USERPROFILE%\.mcp.json`,
  `<SOLUTIONDIR>\.mcp.json`, `.vs\mcp.json`, `.vscode\mcp.json`, `.cursor\mcp.json`). Two of those
  (`.vscode/mcp.json`, `.cursor/mcp.json`) are already owned by the vscode and cursor adapters, so
  to avoid two adapters double-writing one file the Visual Studio adapter targets the VS-specific
  files no other adapter touches: `~/.mcp.json` (user) and `<project>/.mcp.json` (solution). Secret
  strategy `native input` (reused from VS Code: bearer tokens become prompted `${input:…}` entries).
- **Continue** (S19.1): folds to `~/.continue/mcpServers/mcpfold.json` (user) and
  `<project>/.continue/mcpServers/mcpfold.json` (project) — the mcpfold-owned filename never
  clobbers a user's other server files in that directory. Secret strategy `shim` for now: Continue
  has a native `${{ secrets.NAME }}` mechanism, but folding refs into it is the job of the
  native-interpolation strategy (S19.4); until that lands the shim launcher is the safe default.
- **Roo Code** (S19.1): a Cline fork; folds to the global storage file
  `<VS Code User>/globalStorage/rooveterinaryinc.roo-cline/settings/cline_mcp_settings.json` (user,
  keeping Cline's original filename) and `<project>/.roo/mcp.json` (project, which takes precedence
  on a name clash). `mcpServers` root, secret strategy `shim` (matching Cline).
- **Goose** (S19.2): block/goose stores MCP servers as **extensions** in a shared YAML
  `config.yaml` — `~/.config/goose/config.yaml` (macOS/Linux), `%APPDATA%\Block\goose\config\config.yaml`
  (Windows). Format quirks: root key `extensions` (a map), stdio uses `type: stdio` with **`cmd`**
  (not `command`) and **`envs`** (not `env`); remotes use `type: streamable_http` (legacy `sse`)
  with **`uri`** (not `url`). mcpfold merges (see ‡). Secret strategy `shim` (Goose's keyring
  `env_keys` is S19.4's native-interpolation job). Verified July 2026 against the goose-docs.ai
  config-files guide and the `ExtensionConfig` enum in block/goose source.
- **Codex CLI** (S19.2): OpenAI Codex reads `[mcp_servers.<name>]` tables from a shared TOML
  `~/.codex/config.toml` (honors `CODEX_HOME`). stdio: `command`/`args`/`env`; remote streamable
  HTTP: `url` + `http_headers` (Codex authenticates via `bearer_token_env_var`/`auth`, handled by
  the shim). mcpfold merges, preserving other tables (comments not preserved — see ‡). Secret
  strategy `shim`. Verified July 2026 against the hosted Codex config-reference
  (`developers.openai.com/codex/config-reference` → learn.chatgpt.com).
- **LM Studio** (S19.2): "currently follows Cursor's `mcp.json` notation" — root `mcpServers`,
  stdio `command`/`args`/`env`, remote `url`/`headers`, no `type` — so it reuses the shared factory.
  Dedicated file `~/.lmstudio/mcp.json` on every OS (full replace). Secret strategy `shim`. Verified
  July 2026 against lmstudio.ai/docs/app/mcp and the v0.3.17 release notes.
- **Warp** (S19.2): folds to Warp's **file-based** `.mcp.json` — `~/.warp/.mcp.json` (user) and
  `<project>/.warp/.mcp.json` (project) — standard `mcpServers` root, dedicated file (full replace).
  Warp gates file-defined servers behind a one-time approval and never auto-spawns project-scoped
  servers, so the user enables them in Warp after the fold. (GUI-added servers live in Warp Drive,
  which is not a user-editable file — mcpfold targets `.mcp.json` only.) Secret strategy `shim`.
  Verified July 2026 against docs.warp.dev.
- **opencode** (S19.2): the SST terminal agent. MCP servers live under the **`mcp`** key of a shared
  `opencode.json` — `~/.config/opencode/opencode.json` (XDG even on Windows; honors
  `XDG_CONFIG_HOME`) and `<project>/opencode.json`. Distinctive shape: `type: "local"` with
  **`command` as an array** (`[exe, …args]`) and **`environment`** (not `env`); remotes are
  `type: "remote"` with `url`/`headers`; every entry has `enabled: true`. mcpfold merges via a
  comment-preserving jsonc edit (see ‡). Secret strategy `shim`. Verified July 2026 against
  opencode.ai/docs.
- **Copilot CLI** (S19.2): the standalone GitHub Copilot CLI (`copilot`, not `gh copilot`). Dedicated
  `mcp-config.json` under `~/.copilot/` (honors `COPILOT_HOME`) with `mcpServers` root; entries carry
  an explicit `type` (`stdio` / `http`) plus `command`/`args`/`env` or `url`/`headers` — the shared
  factory's `includeType` shape. An optional per-entry `tools` allowlist exists but is left unset
  (mcpfold curates tools through the run shim, not the client file). Secret strategy `shim`. Verified
  July 2026 against docs.github.com (add-mcp-servers + CLI config-dir reference).

## Roadmap & prioritization

New clients are prioritized by, in order:

1. The [opt-in adoption signal](./telemetry.md) — which clients people actually detect/sync (S11.5),
   aggregate and anonymous.
2. Open adapter requests (GitHub issues labeled `adapter-request`).
3. Ecosystem momentum (new clients gaining traction).

**Shipped in wave 1** (S19.1): JetBrains AI Assistant, Visual Studio, Continue, Roo Code — see the
table and client-specific notes above.

**Shipped in wave 2** (S19.2): Goose (YAML), Codex CLI (TOML), LM Studio, Warp, opencode, Copilot
CLI — bringing the matrix to **18 clients**, including the first non-JSON (YAML/TOML) and
shared-config-file (merge, not clobber) adapters. Each was verified against current primary docs at
implementation time (see the client-specific notes and the dates recorded there).

**Next candidates** (unimplemented): Cody. No client with a stable, documented on-disk config file
was deferred in wave 2 — every researched client (Goose, Codex CLI, LM Studio, Warp, opencode,
Copilot CLI) had a format stable enough to ship. Clients that expose MCP config only through a GUI /
internal store with no user-editable file (e.g. Warp's Warp Drive objects) are intentionally not
targeted — mcpfold folds the on-disk file where one exists.

## Add a client

```bash
mcpfold scaffold-adapter <name>   # generates the adapter module + a test stub
```

Then: implement `resolvePath` + (if the client uses the `mcpServers` shape) reuse
`createMcpServersAdapter`, register it in `all.ts`, add it to the matrix test, and run
`pnpm --filter @mcpfold/adapters test -u` to commit its golden. Cline and Gemini CLI (S14.1) were
each added exactly this way in a handful of lines.
