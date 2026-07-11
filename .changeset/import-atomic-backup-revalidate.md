---
'mcpfold': patch
---

Make `mcpfold import` safe on write. The `--force` overwrite path used a plain `writeFileSync` with no
prior backup and no atomicity (unlike migrate/sync/add), and import never re-validated the merged
result — so a client config that parses into a shape the canonical schema rejects could leave an
invalid `mcp.config.jsonc` on disk. Import now re-validates the merged config with `loadConfig` and
refuses to write when it is invalid, backs up an existing config before overwriting, and writes
atomically.
