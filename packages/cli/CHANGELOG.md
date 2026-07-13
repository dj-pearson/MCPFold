# mcpfold

## 1.2.0

### Minor Changes

- 569376b: Add `mcpfold curate`: recommend a per-server `allow` tool-list from recorded proxy usage.

  The proxy audit log already records every `tools/call`; `curate` reads it, reports which tools each
  server actually uses, and (`--write`) applies the minimal `allow` directive back to your
  `mcp.config.jsonc` — preserving comments — so you capture the context-window savings without
  hand-authoring tool lists. Supports `[server]`, `--since <days>`, `--min-calls <n>`, `--json`,
  `--dry-run`, and `--yes`. `mcpfold doctor` now hints at `curate` for a server that has recorded
  usage but no `tools` directive. New pure `@mcpfold/core` helpers (`parseAuditEvents`,
  `analyzeUsage`, `recommendDirective`) power it.

### Patch Changes

- d36961c: Fix shimmed servers failing to start from GUI clients: user-scope folds now embed the canonical config's location into the shim (`mcpfold run <name> --cwd <configDir>`). Clients like Claude Desktop launch MCP servers from an arbitrary working directory (often `/` or the app dir), where the bare shim died with "No mcp.config.jsonc found" even though sync succeeded. The embedded `--cwd` also pins `.env`-adjacent secret resolution to the config's directory. Project-scope folds are unchanged — those client files are committed to the repo (and gated by `sync --check` in CI), so they stay machine-portable. Run `mcpfold sync` once after upgrading to rewrite existing user-scope shims.
- e7f8518: `mcpfold sync` now routes any server carrying a `tools` curation directive through the
  `mcpfold run <name>` shim, even when it has no secret reference. Previously a secret-less
  server was rendered pointing directly at its real command, so the curating proxy never ran
  and the directive was silently dropped. `doctor` gained a check that warns when a `tools`
  directive can't be enforced (remote servers bridge via mcp-remote with no proxy in between),
  and an explicit `secretStrategy: "shim"` is now honored even with zero secret refs.
- Updated dependencies [569376b]
  - @mcpfold/core@1.2.0
  - @mcpfold/adapters@1.2.0
  - @mcpfold/proxy@1.2.0
  - @mcpfold/secrets@1.2.0

## 1.1.0

### Minor Changes

- 8dd913e: Add terminal color and two "how is the tool running" commands. Human output is now colorized when
  stdout is a real terminal — pipes, redirects, and `--json` stay byte-stable, so color is purely a
  display concern that never touches the machine surface. Color respects `NO_COLOR`, `FORCE_COLOR`,
  `MCPFOLD_NO_COLOR`, and `TERM=dumb`. `status` and `doctor` now use it for their ✓/•/⚠/✖ markers, and
  the update notice is colorized too. Two new read-only commands: `mcpfold info` prints an environment
  snapshot (version, install channel, config path, config dir, telemetry / update-notifier opt-in
  state, last update check, detected client counts) — the block to paste into a bug report; and
  `mcpfold update` checks the registry on demand and prints the upgrade command matched to your install
  channel (npm / Homebrew / Scoop / standalone binary) without installing anything. Both support `--json`.

### Patch Changes

- 6e68675: Back up the local canonical config before `mcpfold pull` overwrites it. Previously a pull wrote the
  remote config with no prior backup (unlike `migrate` and `sync`, which both back up first), so a
  mistaken pull could wipe uncommitted local edits with no way to recover — `restore` only targets
  client files, never the canonical `mcp.config.jsonc`. Pull now writes a timestamped
  `*.mcpfold.bak.*` backup first and reports its path in the output.
- 3731788: Add npm READMEs and richer package metadata (keywords, author, engines) for every published package,
  and add WinGet (`winget install PearsonMedia.mcpfold`) + Docker (`ghcr.io/dj-pearson/mcpfold`) as
  install channels alongside npm, Homebrew, and Scoop.
- 6e68675: Harden `atomicWrite` and use it for every config write. It now fsyncs the temp file before the rename
  and the directory after, so the crash-mid-write-leaves-original-intact guarantee actually holds under
  power loss, and it follows a symlinked target — writing through the link to the real file — instead of
  silently replacing the user's symlink with a regular file. `mcpfold export` and `mcpfold init` now
  write via `atomicWrite` too, so a torn read is no longer possible when overwriting a file another tool
  is reading.
- 1020caf: `mcpfold import` now proceeds without `--force` when the canonical config is still the untouched
  `init` scaffold, so the documented `init` → `import` onboarding works in a single pass instead of
  erroring on the existing file. An edited or already-populated config still requires an explicit
  `--force`.
- 6e68675: Make `mcpfold import` safe on write. The `--force` overwrite path used a plain `writeFileSync` with no
  prior backup and no atomicity (unlike migrate/sync/add), and import never re-validated the merged
  result — so a client config that parses into a shape the canonical schema rejects could leave an
  invalid `mcp.config.jsonc` on disk. Import now re-validates the merged config with `loadConfig` and
  refuses to write when it is invalid, backs up an existing config before overwriting, and writes
  atomically.
- 6e68675: Pass the macOS session secret to the Keychain over stdin instead of argv. `mcpfold login` stored the
  serialized session (access + refresh tokens) with `security add-generic-password … -w <secret>`,
  placing the tokens in the process argument list where another local process could read them from `ps`.
  The value is now fed over stdin via a bare `-w`, matching the Linux and Windows branches, so no
  mcpfold-spawned credential command exposes a secret in argv.
- 6e68675: Bound registry access in time and size. Registry fetches now attach an `AbortSignal.timeout` (15s
  default) so a mirror that accepts the connection but never responds fails clearly instead of hanging
  the CLI, and the response body is capped (8 MiB default) rather than buffered unbounded. Reading an
  `.mcpb` bundle now decompresses only `manifest.json`, and only when its declared uncompressed size is
  within a cap, with an entry-count limit — so a zip bomb is rejected on metadata before any bytes are
  inflated.
- 6e68675: Include a server's `env` in the trust-on-first-use executable signature. Environment variables are a
  code-execution channel (`NODE_OPTIONS`, `LD_PRELOAD`, `LD_LIBRARY_PATH`, `DYLD_*`, `PYTHONSTARTUP`,
  `PYTHONPATH`, `BROWSER`), so a tampered or synced config that changed a trusted server's env
  previously ran with no re-approval gate. Now any change to a server's env flips its trust decision to
  `changed` and `mcpfold run` refuses to spawn it until re-approved. Servers with no env keep their
  existing signature, so already-trusted env-less servers are unaffected.
- 1020caf: Add a `--timeout <ms>` flag to `mcpfold test` to override the default 10s per-server connect timeout.
  Cold-start `npx`/`docker` servers frequently exceed 10s on their first run, producing spurious
  "no response" failures; a larger timeout lets them be tested reliably.
- 6e68675: Tighten redaction and unify the secret-ref grammar. The output redactor and the ref-only push guard
  now share a single source of known token prefixes, so both cover GitHub fine-grained PATs
  (`github_pat_`) and Stripe secret keys (`sk_live_`/`sk_test_`) and can't drift apart again. And the
  whole-string and embedded secret-ref matchers now use the same `[^}]+` path class, so an ambiguous ref
  like `${env:a}b}` is parsed consistently (path `a`, not a greedy `a}b`).
- 6e68675: Parse client config files tolerantly. VS Code / Cursor `mcp.json`, Claude Code, and Roo/Cline settings
  are officially JSONC (comments and trailing commas), but adapters parsed them with `JSON.parse`, which
  threw an uncaught `SyntaxError` on a perfectly valid commented file (silently dropping its servers on
  import, or crashing drift detection). Adapters now parse with jsonc-parser, and `diff`/`sync` surface a
  malformed or corrupt on-disk file as a clear error naming the file instead of a raw parser exception.
- 6e68675: Validate numeric CLI flags and harden `mcpfold secret set` for dotenv. `--limit` and `--config-version`
  now parse through a validated integer helper that rejects `NaN`/negative/non-integer values with a
  clear error instead of forwarding garbage to the registry/cloud client. Writing a `${dotenv:...}`
  secret now rejects a newline (which could inject extra `KEY=VALUE` lines) or an `=` in the key, upserts
  an existing key instead of blind-appending a duplicate (so a re-set doesn't leave a stale masked value),
  and re-applies `0600` on POSIX so a pre-existing world-readable `.env` is tightened.
- 6e68675: Validate the cloud token-refresh response before persisting the session. `refresh` returned the JSON
  body unchecked, so a malformed 200 (missing `access_token` or a non-finite `expires_in`) produced an
  undefined access token — which serialized away and silently logged the user out on the next read — or
  a `NaN` expiry that made every call re-refresh. `refresh` now validates the shape at the source (like
  `pollDevice`): a non-empty `access_token`, a finite `expires_in`, and, if the server rotated it, a
  non-empty `refresh_token` — surfacing a clear error instead of corrupting the stored session.
- 6e68675: Validate registry-supplied runtime hints and remote URLs before writing them into client configs. A
  registry package's `runtimeHint` is server-controlled and flowed straight into the launch command, so
  a malicious registry mirror could make mcpfold write an arbitrary command; runners are now whitelisted
  (npx/uvx/docker) and an unrecognized hint is rejected. A registry remote endpoint must be an https URL
  before it is written into a client config.
- 6e68675: Keep `mcpfold sync --watch` alive when a change handler rejects. `watchWithDebounce` invoked its async
  fold as `void fire()`, so a rejected `onChange` promise became an unhandled rejection — process-fatal
  on modern Node — breaking the primitive's documented never-throws contract for any caller. `fire` now
  catches internally so an `onChange` rejection can never escape and the watch keeps running.
- 6e68675: Wire package-integrity (SRI) verification end-to-end. A server's `integrity` hash now survives
  resolution (`ResolvedServer` carries it), and the `--from-mcpb` install path verifies the fetched
  bundle bytes against the declared hash using the shared SRI verifier, failing closed with a
  supply-chain error on a mismatch or a malformed hash. Previously the verifier was never called, so the
  control was decorative.
- Updated dependencies [6e68675]
- Updated dependencies [6e68675]
- Updated dependencies [3731788]
- Updated dependencies [6e68675]
- Updated dependencies [6e68675]
- Updated dependencies [6e68675]
- Updated dependencies [6e68675]
- Updated dependencies [6e68675]
- Updated dependencies [6e68675]
- Updated dependencies [6e68675]
- Updated dependencies [6e68675]
- Updated dependencies [6e68675]
- Updated dependencies [6e68675]
- Updated dependencies [6e68675]
- Updated dependencies [6e68675]
  - @mcpfold/proxy@1.1.0
  - @mcpfold/adapters@1.1.0
  - @mcpfold/core@1.1.0
  - @mcpfold/secrets@1.1.0

## 1.0.2

### Patch Changes

- c4a849c: 1.0.2 — bundles the work merged since 1.0.1. All published packages are now versioned in lockstep.

  - **CLI**: install from an MCPB bundle (`mcpfold add --from-mcpb <file|url>`), official MCP registry integration (`--from-registry` + search), and first-class `.mcp.json` interop as both an import source and an export target.
  - **Adapters**: wave-2 clients (Goose, Codex CLI, LM Studio, Warp, opencode, Copilot CLI, JetBrains, Visual Studio, Continue, Roo Code), a per-client remote-capability matrix (native vs `mcp-remote` shim), native-env secret injection where the client supports it, and compat-harness v2.
  - **Schema**: v2 config — streamable-http transport, OAuth marker, SSE deprecation — with the first real migration.
  - **Proxy**: redacted runtime tool-call audit log.

- Updated dependencies [c4a849c]
  - @mcpfold/core@1.0.2
  - @mcpfold/adapters@1.0.2
  - @mcpfold/proxy@1.0.2
  - @mcpfold/secrets@1.0.2

## 1.0.1

### Patch Changes

- 912a0b8: Fix `mcpfold --version` reporting `0.0.0`. The CLI version is now embedded from
  `packages/cli/package.json` at build time (and on each version bump), so the shipped binary and the
  update-notice report the real release version.

## 1.0.0

### Major Changes

- 866cd4e: Initial Release of MCPFold

### Minor Changes

- a0ca163: Initial public release: the canonical `mcp.config.jsonc` format, six client adapters
  (Cursor, Claude Desktop, Claude Code, VS Code, Windsurf, Zed), the local-first CLI
  (`init`/`import`/`sync`/`diff`/`doctor`/`migrate`/`run`), fail-closed secret resolution
  (env/dotenv/infisical/keychain/1Password) with secrets kept off disk, and the
  tool-curation proxy that cut tool-schema context by ~80% in our benchmark (45 tools →
  9; 7,476 → 1,497 tokens — see docs/benchmark.md).

### Patch Changes

- Updated dependencies [866cd4e]
- Updated dependencies [a0ca163]
  - @mcpfold/adapters@1.0.0
  - @mcpfold/core@1.0.0
  - @mcpfold/proxy@1.0.0
  - @mcpfold/secrets@1.0.0
