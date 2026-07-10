# mcpfold

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
