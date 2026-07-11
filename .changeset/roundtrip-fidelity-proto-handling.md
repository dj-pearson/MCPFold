---
'@mcpfold/core': patch
'@mcpfold/adapters': patch
'@mcpfold/proxy': patch
---

Fix round-trip fidelity and residual prototype-pollution handling. The v1→v2 migration no longer
synthesizes `servers: {}` for a config that omitted it, so the required-field error still fires.
Adapter server maps (render + parse, including the shared factory and vscode/gemini/opencode/codex/goose)
and the proxy's tool-schema `sortDeep` are now built with `Object.create(null)`, so a server literally
named `__proto__` — or a `__proto__` key inside a tool's schema — becomes an own key instead of
corrupting the map or silently vanishing from the pinning digest. The `sse`→`streamable-http` coercion
for bare-url clients (Cursor/Zed/Cline/Warp/LM Studio) that carry no transport marker is now documented;
type-carrying clients (Claude Code, VS Code) preserve `sse` across export→import.
