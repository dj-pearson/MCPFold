---
'mcpfold': patch
---

Keep `mcpfold sync --watch` alive when a change handler rejects. `watchWithDebounce` invoked its async
fold as `void fire()`, so a rejected `onChange` promise became an unhandled rejection — process-fatal
on modern Node — breaking the primitive's documented never-throws contract for any caller. `fire` now
catches internally so an `onChange` rejection can never escape and the watch keeps running.
