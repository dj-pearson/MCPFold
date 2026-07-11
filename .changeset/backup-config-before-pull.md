---
'mcpfold': patch
---

Back up the local canonical config before `mcpfold pull` overwrites it. Previously a pull wrote the
remote config with no prior backup (unlike `migrate` and `sync`, which both back up first), so a
mistaken pull could wipe uncommitted local edits with no way to recover — `restore` only targets
client files, never the canonical `mcp.config.jsonc`. Pull now writes a timestamped
`*.mcpfold.bak.*` backup first and reports its path in the output.
