---
'@mcpfold/proxy': patch
---

Keep the proxy's pending state bounded and refuse unsupported protocol versions. A tracked
`tools/list` id is now evicted on ANY response (an error or non-tools result no longer leaks an entry
per request), the audit in-flight map has a size cap that drops the oldest entries, and the handshake
validates that the `initialize` result is a non-null object and stops before sending
`notifications/initialized`/`tools/list` — and before echoing the version as the `MCP-Protocol-Version`
header — when the negotiated protocol version is one it doesn't support.
