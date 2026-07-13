---
'mcpfold': minor
---

`mcpfold add --url <url> --probe` (E25, S25.4): an opt-in probe that auto-detects a remote server's
transport (streamable-http vs the legacy sse) and whether it requires auth, then scaffolds the entry
accordingly — a placeholder `${env:…}` token reference (never a value) when the endpoint answers with an
auth challenge. It is off by default, so an add stays fully offline unless you ask for it; it is
timeout-bounded and best-effort, falling back to the defaults on any network error, timeout, or
ambiguous response, and an explicit `--transport` always wins. Probing only affects what is written at
add time — it never changes `sync` output.
