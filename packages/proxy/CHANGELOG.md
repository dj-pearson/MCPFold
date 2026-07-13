# @mcpfold/proxy

## 1.3.0

### Patch Changes

- @mcpfold/core@1.3.0

## 1.2.0

### Patch Changes

- Updated dependencies [569376b]
  - @mcpfold/core@1.2.0

## 1.1.0

### Patch Changes

- 6e68675: Reduce proxy audit-sink overhead and make tool filtering O(1). The file audit sink now creates its
  directory once and tracks a running byte counter instead of `statSync`-ing the log on every event, and
  it rotates to a unique per-process filename so concurrent proxies sharing a log path can't clobber each
  other's rotated records (appends stay atomic via O_APPEND). The tool allow/deny directive is
  precompiled into a `Set`, so both the `tools/list` filter and the `tools/call` guard do O(1) membership
  tests instead of an O(n) list scan per tool.
- 6e68675: Keep the proxy's pending state bounded and refuse unsupported protocol versions. A tracked
  `tools/list` id is now evicted on ANY response (an error or non-tools result no longer leaks an entry
  per request), the audit in-flight map has a size cap that drops the oldest entries, and the handshake
  validates that the `initialize` result is a non-null object and stops before sending
  `notifications/initialized`/`tools/list` — and before echoing the version as the `MCP-Protocol-Version`
  header — when the negotiated protocol version is one it doesn't support.
- 3731788: Add npm READMEs and richer package metadata (keywords, author, engines) for every published package,
  and add WinGet (`winget install PearsonMedia.mcpfold`) + Docker (`ghcr.io/dj-pearson/mcpfold`) as
  install channels alongside npm, Homebrew, and Scoop.
- 6e68675: Contain a malicious or crashing MCP server behind the curation proxy. The stdio transport now caps a
  single unterminated line (default 8 MiB), force-closing the connection instead of buffering without
  bound, and handles stream `error`/`end`/`close` — a server that floods stdout or dies mid-write
  (EPIPE) tears the session down cleanly through a new `onClose` signal rather than raising an uncaught
  exception. `close()` now removes every listener and destroys the stream, and a final newline-less
  message is delivered on EOF instead of being dropped.
- 6e68675: Close two tool-filter bypasses in the curation proxy. A `tools/call` sent as a notification (no id)
  skipped the allow/deny check and was forwarded fire-and-forget to the server; the filter now applies
  to `tools/call` regardless of id (a blocked notification-form call is dropped, never forwarded). Tool
  names are now matched case- and whitespace-insensitively on both the `tools/list` filter and the
  `tools/call` guard, so a deny-listed tool can't slip through under a spelling variant (`FOO`, `foo `).
- 6e68675: Fix round-trip fidelity and residual prototype-pollution handling. The v1→v2 migration no longer
  synthesizes `servers: {}` for a config that omitted it, so the required-field error still fires.
  Adapter server maps (render + parse, including the shared factory and vscode/gemini/opencode/codex/goose)
  and the proxy's tool-schema `sortDeep` are now built with `Object.create(null)`, so a server literally
  named `__proto__` — or a `__proto__` key inside a tool's schema — becomes an own key instead of
  corrupting the map or silently vanishing from the pinning digest. The `sse`→`streamable-http` coercion
  for bare-url clients (Cursor/Zed/Cline/Warp/LM Studio) that carry no transport marker is now documented;
  type-carrying clients (Claude Code, VS Code) preserve `sse` across export→import.
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
