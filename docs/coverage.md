# Adapter coverage

Breadth is the moat. This is the living matrix of clients mcpfold folds to, plus how the roadmap is
prioritized. Adding a client is a one-PR job — see [Adapters](./adapters.md) and
`mcpfold scaffold-adapter <name>`.

## Supported clients

| Client         | Config root       | Scopes        | Secret strategy | Restart on change |
| -------------- | ----------------- | ------------- | --------------- | ----------------- |
| Claude Code    | `mcpServers`      | user          | shim            | no                |
| Claude Desktop | `mcpServers`      | user          | shim            | **yes**           |
| Cursor         | `mcpServers`      | user, project | shim            | no                |
| VS Code        | `servers`         | user, project | native input    | no                |
| Windsurf       | `mcpServers`\*    | user          | shim            | **yes**           |
| Zed            | `context_servers` | user          | shim            | **yes**           |
| Cline          | `mcpServers`      | user          | shim            | no                |
| Gemini CLI     | `mcpServers`      | user          | shim            | no                |

\* Windsurf can't natively call authenticated remote servers, so authed http/sse servers are
rewritten to a `mcp-remote` stdio invocation (reversible on import).

Every adapter passes the shared cross-adapter matrix (render → committed golden + render → parse
round-trip) and the deterministic-serialization invariant.

## Roadmap & prioritization

New clients are prioritized by, in order:

1. The [opt-in adoption signal](./telemetry.md) — which clients people actually detect/sync (S11.5),
   aggregate and anonymous.
2. Open adapter requests (GitHub issues labeled `adapter-request`).
3. Ecosystem momentum (new clients gaining traction).

**Next candidates** (unimplemented): Continue, Goose, Warp, JetBrains AI, Cody, Roo Code. Several
use non-`mcpServers` formats (YAML, nested config), so they need a bespoke `render`/`parse` rather
than the shared `mcpServers` factory — a good first contribution via `scaffold-adapter`.

## Add a client

```bash
mcpfold scaffold-adapter <name>   # generates the adapter module + a test stub
```

Then: implement `resolvePath` + (if the client uses the `mcpServers` shape) reuse
`createMcpServersAdapter`, register it in `all.ts`, add it to the matrix test, and run
`pnpm --filter @mcpfold/adapters test -u` to commit its golden. Cline and Gemini CLI (S14.1) were
each added exactly this way in a handful of lines.
