---
'@mcpfold/core': patch
---

Reject `__proto__`, `constructor`, and `prototype` keys in the config parser. Previously a document
whose body was nested under `__proto__` validated as an empty config — silently bypassing the strict
schema and dropping any real servers/profiles nested there. `loadConfig` now returns a positioned
schema error for any such key, config objects are reconstructed with a null prototype, and the
deterministic serializer and v1→v2 migration are hardened against prototype pollution too.
