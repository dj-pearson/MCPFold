---
'@mcpfold/secrets': patch
'@mcpfold/core': patch
'@mcpfold/schema': patch
---

Fix a command-injection vulnerability in the Windows keychain secret provider: a `${keychain:...}`
account is now passed to PowerShell out-of-band via environment variables instead of being
interpolated into the `-Command` script, so a tampered or synced config can no longer execute code
during secret resolution. As defense in depth, the core secret-reference grammar now rejects paths
containing shell/quote metacharacters at schema-validation time.
