---
'mcpfold': patch
---

Bound registry access in time and size. Registry fetches now attach an `AbortSignal.timeout` (15s
default) so a mirror that accepts the connection but never responds fails clearly instead of hanging
the CLI, and the response body is capped (8 MiB default) rather than buffered unbounded. Reading an
`.mcpb` bundle now decompresses only `manifest.json`, and only when its declared uncompressed size is
within a cap, with an entry-count limit — so a zip bomb is rejected on metadata before any bytes are
inflated.
