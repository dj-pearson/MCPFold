# @mcpfold/secrets

## 1.3.0

### Patch Changes

- @mcpfold/core@1.3.0

## 1.2.0

### Patch Changes

- Updated dependencies [569376b]
  - @mcpfold/core@1.2.0

## 1.1.0

### Patch Changes

- 3731788: Add npm READMEs and richer package metadata (keywords, author, engines) for every published package,
  and add WinGet (`winget install PearsonMedia.mcpfold`) + Docker (`ghcr.io/dj-pearson/mcpfold`) as
  install channels alongside npm, Homebrew, and Scoop.
- 6e68675: Fix a command-injection vulnerability in the Windows keychain secret provider: a `${keychain:...}`
  account is now passed to PowerShell out-of-band via environment variables instead of being
  interpolated into the `-Command` script, so a tampered or synced config can no longer execute code
  during secret resolution. As defense in depth, the core secret-reference grammar now rejects paths
  containing shell/quote metacharacters at schema-validation time.
- Updated dependencies [3731788]
- Updated dependencies [6e68675]
- Updated dependencies [6e68675]
- Updated dependencies [6e68675]
- Updated dependencies [6e68675]
- Updated dependencies [6e68675]
- Updated dependencies [6e68675]
- Updated dependencies [6e68675]
- Updated dependencies [6e68675]
  - @mcpfold/core@1.1.0

## 1.0.2

### Patch Changes

- c4a849c: 1.0.2 — bundles the work merged since 1.0.1. All published packages are now versioned in lockstep.

  - **CLI**: install from an MCPB bundle (`mcpfold add --from-mcpb <file|url>`), official MCP registry integration (`--from-registry` + search), and first-class `.mcp.json` interop as both an import source and an export target.
  - **Adapters**: wave-2 clients (Goose, Codex CLI, LM Studio, Warp, opencode, Copilot CLI, JetBrains, Visual Studio, Continue, Roo Code), a per-client remote-capability matrix (native vs `mcp-remote` shim), native-env secret injection where the client supports it, and compat-harness v2.
  - **Schema**: v2 config — streamable-http transport, OAuth marker, SSE deprecation — with the first real migration.
  - **Proxy**: redacted runtime tool-call audit log.

- Updated dependencies [c4a849c]
  - @mcpfold/core@1.0.2

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
  - @mcpfold/core@1.0.0
