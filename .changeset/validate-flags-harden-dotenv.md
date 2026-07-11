---
'mcpfold': patch
---

Validate numeric CLI flags and harden `mcpfold secret set` for dotenv. `--limit` and `--config-version`
now parse through a validated integer helper that rejects `NaN`/negative/non-integer values with a
clear error instead of forwarding garbage to the registry/cloud client. Writing a `${dotenv:...}`
secret now rejects a newline (which could inject extra `KEY=VALUE` lines) or an `=` in the key, upserts
an existing key instead of blind-appending a duplicate (so a re-set doesn't leave a stale masked value),
and re-applies `0600` on POSIX so a pre-existing world-readable `.env` is tightened.
