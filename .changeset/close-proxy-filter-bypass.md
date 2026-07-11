---
'@mcpfold/proxy': patch
---

Close two tool-filter bypasses in the curation proxy. A `tools/call` sent as a notification (no id)
skipped the allow/deny check and was forwarded fire-and-forget to the server; the filter now applies
to `tools/call` regardless of id (a blocked notification-form call is dropped, never forwarded). Tool
names are now matched case- and whitespace-insensitively on both the `tools/list` filter and the
`tools/call` guard, so a deny-listed tool can't slip through under a spelling variant (`FOO`, `foo `).
