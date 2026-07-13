---
'mcpfold': patch
---

Groundwork for guided config repair (E25, S25.1): the `doctor` `Finding` type now carries an optional
`autofix` descriptor — a deterministic, machine-applicable form of the human `fix` string. The VS Code
root-key trap, inert curation, an unpinned/vulnerable `mcp-remote` bridge, and a malformed client file
map to a `resync-client` fix; a hardcoded secret maps to a guided `extract-secret` fix and a deprecated
`sse` transport to a guided `rewrite-transport` fix. Ambiguous findings (unpinned `@latest`, unknown
secret schemes, schema errors) stay advisory with no descriptor. No user-facing behavior change yet —
`doctor --fix` (S25.2) consumes these descriptors.
