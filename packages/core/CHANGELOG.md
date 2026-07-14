# @mcpfold/core

## 1.4.1

## 1.4.0

## 1.3.0

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

## 1.1.0

### Patch Changes

- 3731788: Add npm READMEs and richer package metadata (keywords, author, engines) for every published package,
  and add WinGet (`winget install PearsonMedia.mcpfold`) + Docker (`ghcr.io/dj-pearson/mcpfold`) as
  install channels alongside npm, Homebrew, and Scoop.
- 6e68675: Enforce a nesting-depth limit (64 levels) when loading a config so a pathologically nested document
  is a clean validation error instead of an uncaught `RangeError`. `loadConfig` now scans for excessive
  depth iteratively before parsing (both `parseTree` and the value reconstruction recurse per level and
  would otherwise overflow the stack), and the deterministic serializer is depth-capped too. This
  closes a denial-of-service vector where a hostile or mistyped config could crash the tool.
- 6e68675: Keep `loadConfig`'s no-throw contract for malformed version numbers. A config with a version that is
  0, negative, or fractional previously threw an uncaught `MigrationError`, crashing any consumer
  (doctor, sync) that relies on the documented `LoadResult`. `loadConfig` now returns a positioned
  schema error for a non-positive-integer version and also catches any migration failure, so a single
  version typo produces a clear message instead of a crash.
- 6e68675: Fix org-policy package matching and a glob ReDoS. Package rules matched with a raw `startsWith`, so a
  rule for `@modelcontextprotocol/server-git` also matched `@modelcontextprotocol/server-github` and
  `foo` matched `foo-bar` — over/under-applying a deny-wins control. Matching now requires a name
  boundary (exact versionless-spec equality, or the next character is `/` or `@`). And a `url` glob
  containing `**` compiled to adjacent `.*.*`, which backtracks catastrophically against a long URL;
  runs of `*` are now collapsed before compiling so glob evaluation is linear.
- 6e68675: Reject `__proto__`, `constructor`, and `prototype` keys in the config parser. Previously a document
  whose body was nested under `__proto__` validated as an empty config — silently bypassing the strict
  schema and dropping any real servers/profiles nested there. `loadConfig` now returns a positioned
  schema error for any such key, config objects are reconstructed with a null prototype, and the
  deterministic serializer and v1→v2 migration are hardened against prototype pollution too.
- 6e68675: Fix round-trip fidelity and residual prototype-pollution handling. The v1→v2 migration no longer
  synthesizes `servers: {}` for a config that omitted it, so the required-field error still fires.
  Adapter server maps (render + parse, including the shared factory and vscode/gemini/opencode/codex/goose)
  and the proxy's tool-schema `sortDeep` are now built with `Object.create(null)`, so a server literally
  named `__proto__` — or a `__proto__` key inside a tool's schema — becomes an own key instead of
  corrupting the map or silently vanishing from the pinning digest. The `sse`→`streamable-http` coercion
  for bare-url clients (Cursor/Zed/Cline/Warp/LM Studio) that carry no transport marker is now documented;
  type-carrying clients (Claude Code, VS Code) preserve `sse` across export→import.
- 6e68675: Fix a command-injection vulnerability in the Windows keychain secret provider: a `${keychain:...}`
  account is now passed to PowerShell out-of-band via environment variables instead of being
  interpolated into the `-Command` script, so a tampered or synced config can no longer execute code
  during secret resolution. As defense in depth, the core secret-reference grammar now rejects paths
  containing shell/quote metacharacters at schema-validation time.
- 6e68675: Tighten redaction and unify the secret-ref grammar. The output redactor and the ref-only push guard
  now share a single source of known token prefixes, so both cover GitHub fine-grained PATs
  (`github_pat_`) and Stripe secret keys (`sk_live_`/`sk_test_`) and can't drift apart again. And the
  whole-string and embedded secret-ref matchers now use the same `[^}]+` path class, so an ambiguous ref
  like `${env:a}b}` is parsed consistently (path `a`, not a greedy `a}b`).
- 6e68675: Wire package-integrity (SRI) verification end-to-end. A server's `integrity` hash now survives
  resolution (`ResolvedServer` carries it), and the `--from-mcpb` install path verifies the fetched
  bundle bytes against the declared hash using the shared SRI verifier, failing closed with a
  supply-chain error on a mismatch or a malformed hash. Previously the verifier was never called, so the
  control was decorative.

## 1.0.2

### Patch Changes

- c4a849c: 1.0.2 — bundles the work merged since 1.0.1. All published packages are now versioned in lockstep.

  - **CLI**: install from an MCPB bundle (`mcpfold add --from-mcpb <file|url>`), official MCP registry integration (`--from-registry` + search), and first-class `.mcp.json` interop as both an import source and an export target.
  - **Adapters**: wave-2 clients (Goose, Codex CLI, LM Studio, Warp, opencode, Copilot CLI, JetBrains, Visual Studio, Continue, Roo Code), a per-client remote-capability matrix (native vs `mcp-remote` shim), native-env secret injection where the client supports it, and compat-harness v2.
  - **Schema**: v2 config — streamable-http transport, OAuth marker, SSE deprecation — with the first real migration.
  - **Proxy**: redacted runtime tool-call audit log.

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
