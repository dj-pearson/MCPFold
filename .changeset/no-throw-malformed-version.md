---
'@mcpfold/core': patch
---

Keep `loadConfig`'s no-throw contract for malformed version numbers. A config with a version that is
0, negative, or fractional previously threw an uncaught `MigrationError`, crashing any consumer
(doctor, sync) that relies on the documented `LoadResult`. `loadConfig` now returns a positioned
schema error for a non-positive-integer version and also catches any migration failure, so a single
version typo produces a clear message instead of a crash.
