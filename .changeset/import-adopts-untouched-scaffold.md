---
'mcpfold': patch
---

`mcpfold import` now proceeds without `--force` when the canonical config is still the untouched
`init` scaffold, so the documented `init` → `import` onboarding works in a single pass instead of
erroring on the existing file. An edited or already-populated config still requires an explicit
`--force`.
