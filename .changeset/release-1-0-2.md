---
'mcpfold': patch
'@mcpfold/core': patch
'@mcpfold/adapters': patch
'@mcpfold/proxy': patch
'@mcpfold/schema': patch
'@mcpfold/secrets': patch
---

1.0.2 — bundles the work merged since 1.0.1. All published packages are now versioned in lockstep.

- **CLI**: install from an MCPB bundle (`mcpfold add --from-mcpb <file|url>`), official MCP registry integration (`--from-registry` + search), and first-class `.mcp.json` interop as both an import source and an export target.
- **Adapters**: wave-2 clients (Goose, Codex CLI, LM Studio, Warp, opencode, Copilot CLI, JetBrains, Visual Studio, Continue, Roo Code), a per-client remote-capability matrix (native vs `mcp-remote` shim), native-env secret injection where the client supports it, and compat-harness v2.
- **Schema**: v2 config — streamable-http transport, OAuth marker, SSE deprecation — with the first real migration.
- **Proxy**: redacted runtime tool-call audit log.
