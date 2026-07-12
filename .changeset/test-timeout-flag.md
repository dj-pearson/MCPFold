---
'mcpfold': patch
---

Add a `--timeout <ms>` flag to `mcpfold test` to override the default 10s per-server connect timeout.
Cold-start `npx`/`docker` servers frequently exceed 10s on their first run, producing spurious
"no response" failures; a larger timeout lets them be tested reliably.
