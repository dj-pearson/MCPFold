# Adapter coverage

Breadth is the moat. This is the living matrix of clients mcpfold folds to, plus how the roadmap is
prioritized. Adding a client is a one-PR job — see [Adapters](./adapters.md) and
`mcpfold scaffold-adapter <name>`.

## Supported clients

| Client         | Config root        | Scopes        | Secret strategy | Restart on change |
| -------------- | ------------------ | ------------- | --------------- | ----------------- |
| Claude Code    | `mcpServers`       | user          | shim            | no                |
| Claude Desktop | `mcpServers`       | user          | shim            | **yes**           |
| Cursor         | `mcpServers`       | user, project | shim            | no                |
| VS Code        | `servers`          | user, project | native input    | no                |
| Windsurf       | `mcpServers`\*     | user          | shim            | **yes**           |
| Zed            | `context_servers`  | user          | shim            | no                |
| Cline          | `mcpServers`       | user          | shim            | no                |
| Gemini CLI     | `mcpServers`       | user          | shim            | no                |
| JetBrains      | `mcpServers`       | user, project | shim            | no                |
| Visual Studio  | `servers`\*\*      | user, project | native input    | no                |
| Continue       | `mcpServers`\*\*\* | user, project | shim            | no                |
| Roo Code       | `mcpServers`       | user, project | shim            | no                |

\* Windsurf can't natively call authenticated remote servers, so authed http/sse servers are
rewritten to a `mcp-remote` stdio invocation (reversible on import). The bridge is always pinned
to a CVE-safe version (`mcp-remote@0.1.38`; floor `0.1.16` fixes CVE-2025-6514) — never unpinned —
and `mcpfold doctor` warns if it finds an unpinned or vulnerable `mcp-remote` in a client config.

\*\* Visual Studio reads MCP config in the **VS Code dialect** (root key `servers` + a top-level
`inputs` array), so its adapter reuses the VS Code render/parse verbatim and only changes path
resolution — see the client-specific note below.

\*\*\* Continue's own config is YAML, but it also auto-loads any JSON MCP file dropped into a
`.continue/mcpServers/` directory (the documented migration path for Claude Desktop / Cursor /
Cline users), so mcpfold folds to a JSON file there with the standard `mcpServers` root — no YAML
dependency.

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
  this table, and the spec.
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

## Roadmap & prioritization

New clients are prioritized by, in order:

1. The [opt-in adoption signal](./telemetry.md) — which clients people actually detect/sync (S11.5),
   aggregate and anonymous.
2. Open adapter requests (GitHub issues labeled `adapter-request`).
3. Ecosystem momentum (new clients gaining traction).

**Shipped in wave 1** (S19.1): JetBrains AI Assistant, Visual Studio, Continue, Roo Code — see the
table and client-specific notes above.

**Next candidates** (unimplemented): Goose, Warp, Cody, LM Studio, Codex CLI. Several use
non-`mcpServers` formats (YAML, TOML, nested config), so they need a bespoke `render`/`parse` rather
than the shared `mcpServers` factory — a good first contribution via `scaffold-adapter`.

## Add a client

```bash
mcpfold scaffold-adapter <name>   # generates the adapter module + a test stub
```

Then: implement `resolvePath` + (if the client uses the `mcpServers` shape) reuse
`createMcpServersAdapter`, register it in `all.ts`, add it to the matrix test, and run
`pnpm --filter @mcpfold/adapters test -u` to commit its golden. Cline and Gemini CLI (S14.1) were
each added exactly this way in a handful of lines.
