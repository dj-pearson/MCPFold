---
'mcpfold': minor
---

`mcpfold doctor --fix` (E25, S25.2): apply the deterministic repairs for doctor findings. It previews
by default (per-finding, writes nothing) and applies on `--fix --yes`; `--fix <ids>` scopes to specific
findings. Auto-applicable fixes (the VS Code root-key trap, inert curation, an unpinned/vulnerable
mcp-remote bridge, a malformed client file) re-fold that client through the real `sync` path — backing
up first, writing atomically, then re-running doctor to confirm; any fix that raises the error count is
rolled back from its backup. Guided fixes (a hardcoded secret, a deprecated `sse` transport) are
reported but never auto-applied, and no secret value ever appears in the output. `--json` reports what
was applied, skipped, and failed; the exit code reflects the errors that remain.
