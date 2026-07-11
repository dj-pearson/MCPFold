---
'@mcpfold/core': patch
---

Enforce a nesting-depth limit (64 levels) when loading a config so a pathologically nested document
is a clean validation error instead of an uncaught `RangeError`. `loadConfig` now scans for excessive
depth iteratively before parsing (both `parseTree` and the value reconstruction recurse per level and
would otherwise overflow the stack), and the deterministic serializer is depth-capped too. This
closes a denial-of-service vector where a hostile or mistyped config could crash the tool.
