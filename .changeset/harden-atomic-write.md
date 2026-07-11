---
'mcpfold': patch
---

Harden `atomicWrite` and use it for every config write. It now fsyncs the temp file before the rename
and the directory after, so the crash-mid-write-leaves-original-intact guarantee actually holds under
power loss, and it follows a symlinked target — writing through the link to the real file — instead of
silently replacing the user's symlink with a regular file. `mcpfold export` and `mcpfold init` now
write via `atomicWrite` too, so a torn read is no longer possible when overwriting a file another tool
is reading.
