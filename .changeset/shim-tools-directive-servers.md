---
'mcpfold': patch
---

`mcpfold sync` now routes any server carrying a `tools` curation directive through the
`mcpfold run <name>` shim, even when it has no secret reference. Previously a secret-less
server was rendered pointing directly at its real command, so the curating proxy never ran
and the directive was silently dropped. `doctor` gained a check that warns when a `tools`
directive can't be enforced (remote servers bridge via mcp-remote with no proxy in between),
and an explicit `secretStrategy: "shim"` is now honored even with zero secret refs.
