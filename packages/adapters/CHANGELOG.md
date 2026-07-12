# @mcpfold/adapters

## 1.1.0

### Patch Changes

- 3731788: Add npm READMEs and richer package metadata (keywords, author, engines) for every published package,
  and add WinGet (`winget install PearsonMedia.mcpfold`) + Docker (`ghcr.io/dj-pearson/mcpfold`) as
  install channels alongside npm, Homebrew, and Scoop.
- 6e68675: Fix data loss on `sync`: adapters whose target file is shared with non-MCP client state now merge
  into it (replacing only the MCP-servers section) instead of overwriting the whole file. Previously a
  first sync to Claude Code (`~/.claude.json`), Zed, Gemini CLI, VS Code, or Claude Desktop could wipe
  the user's OAuth account, editor settings, theme, or history. The merge uses a jsonc-parser
  structural edit, preserving every other top-level key plus comments and formatting for JSONC files.
- 6e68675: Fix round-trip fidelity and residual prototype-pollution handling. The v1→v2 migration no longer
  synthesizes `servers: {}` for a config that omitted it, so the required-field error still fires.
  Adapter server maps (render + parse, including the shared factory and vscode/gemini/opencode/codex/goose)
  and the proxy's tool-schema `sortDeep` are now built with `Object.create(null)`, so a server literally
  named `__proto__` — or a `__proto__` key inside a tool's schema — becomes an own key instead of
  corrupting the map or silently vanishing from the pinning digest. The `sse`→`streamable-http` coercion
  for bare-url clients (Cursor/Zed/Cline/Warp/LM Studio) that carry no transport marker is now documented;
  type-carrying clients (Claude Code, VS Code) preserve `sse` across export→import.
- 6e68675: Parse client config files tolerantly. VS Code / Cursor `mcp.json`, Claude Code, and Roo/Cline settings
  are officially JSONC (comments and trailing commas), but adapters parsed them with `JSON.parse`, which
  threw an uncaught `SyntaxError` on a perfectly valid commented file (silently dropping its servers on
  import, or crashing drift detection). Adapters now parse with jsonc-parser, and `diff`/`sync` surface a
  malformed or corrupt on-disk file as a clear error naming the file instead of a raw parser exception.
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
