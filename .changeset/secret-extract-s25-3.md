---
'mcpfold': minor
---

`mcpfold secret extract <server>` (E25, S25.3): the guided repair for a hardcoded token. It finds the
literal secret values in a server's `env` / `auth.headers` (the same detector `doctor` uses), moves
each into a provider — default `dotenv`, or `--scheme env|keychain|infisical|op`, or an interactive
chooser — and rewrites the config value to a `${scheme:path}` reference with a comment-preserving edit,
backing the config up first and re-validating. `dotenv` persists the value to `.env`; every other
scheme prints the exact store-it command with a `<value>` placeholder (the raw value is never echoed
to stdout or logs, and stays recoverable from the config backup). Once the value is a reference,
`mcpfold sync` folds it through the run shim, so it never lands in any client file. This is also the
command `doctor --fix` points you to for a hardcoded-secret finding.
