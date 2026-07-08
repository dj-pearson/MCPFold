---
"mcpfold": patch
---

Fix `mcpfold --version` reporting `0.0.0`. The CLI version is now embedded from
`packages/cli/package.json` at build time (and on each version bump), so the shipped binary and the
update-notice report the real release version.
