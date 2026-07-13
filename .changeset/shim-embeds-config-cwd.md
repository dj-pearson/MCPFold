---
'mcpfold': patch
---

Fix shimmed servers failing to start from GUI clients: user-scope folds now embed the canonical config's location into the shim (`mcpfold run <name> --cwd <configDir>`). Clients like Claude Desktop launch MCP servers from an arbitrary working directory (often `/` or the app dir), where the bare shim died with "No mcp.config.jsonc found" even though sync succeeded. The embedded `--cwd` also pins `.env`-adjacent secret resolution to the config's directory. Project-scope folds are unchanged — those client files are committed to the repo (and gated by `sync --check` in CI), so they stay machine-portable. Run `mcpfold sync` once after upgrading to rewrite existing user-scope shims.
