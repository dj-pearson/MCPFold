---
'mcpfold': patch
---

Pass the macOS session secret to the Keychain over stdin instead of argv. `mcpfold login` stored the
serialized session (access + refresh tokens) with `security add-generic-password … -w <secret>`,
placing the tokens in the process argument list where another local process could read them from `ps`.
The value is now fed over stdin via a bare `-w`, matching the Linux and Windows branches, so no
mcpfold-spawned credential command exposes a secret in argv.
