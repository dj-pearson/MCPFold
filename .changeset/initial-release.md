---
'@mcpfold/core': minor
'@mcpfold/adapters': minor
'@mcpfold/secrets': minor
'@mcpfold/proxy': minor
'@mcpfold/schema': minor
'mcpfold': minor
---

Initial public release: the canonical `mcp.config.jsonc` format, six client adapters
(Cursor, Claude Desktop, Claude Code, VS Code, Windsurf, Zed), the local-first CLI
(`init`/`import`/`sync`/`diff`/`doctor`/`migrate`/`run`), fail-closed secret resolution
(env/dotenv/infisical/keychain/1Password) with secrets kept off disk, and the
tool-curation proxy.
