---
'@mcpfold/core': minor
'mcpfold': minor
---

Add `mcpfold curate`: recommend a per-server `allow` tool-list from recorded proxy usage.

The proxy audit log already records every `tools/call`; `curate` reads it, reports which tools each
server actually uses, and (`--write`) applies the minimal `allow` directive back to your
`mcp.config.jsonc` — preserving comments — so you capture the context-window savings without
hand-authoring tool lists. Supports `[server]`, `--since <days>`, `--min-calls <n>`, `--json`,
`--dry-run`, and `--yes`. `mcpfold doctor` now hints at `curate` for a server that has recorded
usage but no `tools` directive. New pure `@mcpfold/core` helpers (`parseAuditEvents`,
`analyzeUsage`, `recommendDirective`) power it.
