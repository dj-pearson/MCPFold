---
'mcpfold': minor
---

`mcpfold explain <topic>` (E25, S25.5): offline, authored explanations of every doctor finding class and
core concept (the run shim, tool curation, secret references, the VS Code root-key trap, the mcp-remote
CVE, and more). Every `doctor` finding now ends with a `see: mcpfold explain <id>` pointer, so you can
learn *why* a footgun matters and *why* the fix is right instead of applying fixes blindly. Run bare to
list topics; `--json` returns the structured entry. The catalog is static and versioned in the CLI —
no network, no generation.
