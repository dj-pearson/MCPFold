# mcpfold

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
