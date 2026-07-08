---
title: Introducing mcpfold
date: 2026-07-08
description: One source of truth for your MCP servers — write once, fold out to every client, without paying the context-window tax.
---

MCP config has a sprawl problem. Every client stores its servers differently — Cursor and Claude
use `mcpServers`, VS Code uses `servers` with `${input:}` secrets, Zed uses `context_servers`,
Windsurf can't even call authenticated remotes natively. So you copy-paste the same servers into
five files, hardcode tokens into plaintext JSON, and every server you add dumps its full tool
schema into your agent's context on every turn — used or not.

**mcpfold keeps one canonical `mcp.config.jsonc` and folds it out to every client**, each in its
own format. Secrets are references (`${env:…}`), never values, so nothing sensitive lands on disk.
And a local proxy curates each server's toolset per client, so connecting everything doesn't tax
your context window.

## The wedge

```bash
npx mcpfold init      # scaffold your canonical config
npx mcpfold import    # adopt the configs you already have
npx mcpfold sync      # fold it out to every client
```

`diff` gates drift in CI, `doctor` catches the silent footguns, and `sync --watch` keeps every
client current as a background habit. It's MIT-licensed and runs entirely on your machine — no
account required.

## Why now

Agents are only as useful as the tools they can reach, and the client ecosystem is fragmenting
fast. Breadth is the moat: mcpfold folds to eight clients today and adding one is a one-PR job.
Read the [context-window benchmark](/blog/the-context-window-tax) for the numbers, or just
[install it](/install) and fold your first config in under a minute.
