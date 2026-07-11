---
'@mcpfold/proxy': patch
---

Contain a malicious or crashing MCP server behind the curation proxy. The stdio transport now caps a
single unterminated line (default 8 MiB), force-closing the connection instead of buffering without
bound, and handles stream `error`/`end`/`close` — a server that floods stdout or dies mid-write
(EPIPE) tears the session down cleanly through a new `onClose` signal rather than raising an uncaught
exception. `close()` now removes every listener and destroys the stream, and a final newline-less
message is delivered on EOF instead of being dropped.
