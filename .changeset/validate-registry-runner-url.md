---
'mcpfold': patch
---

Validate registry-supplied runtime hints and remote URLs before writing them into client configs. A
registry package's `runtimeHint` is server-controlled and flowed straight into the launch command, so
a malicious registry mirror could make mcpfold write an arbitrary command; runners are now whitelisted
(npx/uvx/docker) and an unrecognized hint is rejected. A registry remote endpoint must be an https URL
before it is written into a client config.
