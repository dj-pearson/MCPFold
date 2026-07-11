---
'mcpfold': patch
---

Include a server's `env` in the trust-on-first-use executable signature. Environment variables are a
code-execution channel (`NODE_OPTIONS`, `LD_PRELOAD`, `LD_LIBRARY_PATH`, `DYLD_*`, `PYTHONSTARTUP`,
`PYTHONPATH`, `BROWSER`), so a tampered or synced config that changed a trusted server's env
previously ran with no re-approval gate. Now any change to a server's env flips its trust decision to
`changed` and `mcpfold run` refuses to spawn it until re-approved. Servers with no env keep their
existing signature, so already-trusted env-less servers are unaffected.
