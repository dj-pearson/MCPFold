---
'@mcpfold/adapters': patch
---

Fix data loss on `sync`: adapters whose target file is shared with non-MCP client state now merge
into it (replacing only the MCP-servers section) instead of overwriting the whole file. Previously a
first sync to Claude Code (`~/.claude.json`), Zed, Gemini CLI, VS Code, or Claude Desktop could wipe
the user's OAuth account, editor settings, theme, or history. The merge uses a jsonc-parser
structural edit, preserving every other top-level key plus comments and formatting for JSONC files.
