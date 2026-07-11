---
'@mcpfold/adapters': patch
'mcpfold': patch
---

Parse client config files tolerantly. VS Code / Cursor `mcp.json`, Claude Code, and Roo/Cline settings
are officially JSONC (comments and trailing commas), but adapters parsed them with `JSON.parse`, which
threw an uncaught `SyntaxError` on a perfectly valid commented file (silently dropping its servers on
import, or crashing drift detection). Adapters now parse with jsonc-parser, and `diff`/`sync` surface a
malformed or corrupt on-disk file as a clear error naming the file instead of a raw parser exception.
