---
'@mcpfold/proxy': patch
---

Reduce proxy audit-sink overhead and make tool filtering O(1). The file audit sink now creates its
directory once and tracks a running byte counter instead of `statSync`-ing the log on every event, and
it rotates to a unique per-process filename so concurrent proxies sharing a log path can't clobber each
other's rotated records (appends stay atomic via O_APPEND). The tool allow/deny directive is
precompiled into a `Set`, so both the `tools/list` filter and the `tools/call` guard do O(1) membership
tests instead of an O(n) list scan per tool.
