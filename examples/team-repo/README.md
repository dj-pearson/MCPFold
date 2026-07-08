# Team MCP config (config-as-code example)

A worked example of the [config-as-code convention](../../docs/team-config-as-code.md) (S12.1):
one committed `mcp.config.jsonc` is the team's source of truth, every developer folds it locally,
and CI fails on drift — no backend required.

## What's here

```
mcp.config.jsonc              # the canonical source of truth (committed)
.vscode/mcp.json              # folded output for VS Code (committed)
.cursor/mcp.json              # folded output for Cursor  (committed)
.github/workflows/mcp-drift.yml   # CI gate: `mcpfold sync --check`
```

The folded client files are **committed** (project-scope profiles write them into the repo), so
CI can diff them against the canonical config.

## The loop

1. **Edit the source of truth.** Change `mcp.config.jsonc` (add a server, retag a profile).
2. **Fold it out.** Run `npx mcpfold sync` — it rewrites `.vscode/mcp.json` and `.cursor/mcp.json`.
   Commit all three together.
3. **Teammates fold locally.** After pulling, each developer runs `npx mcpfold sync` to update
   their editors. The first time they launch a new server, mcpfold's trust prompt asks them to
   review the launch command a teammate committed:

   ```
   $ npx mcpfold trust        # review + approve every new/changed launch command
   ```

   In CI (after review), `mcpfold trust` approves non-interactively — see the convention doc.

4. **CI gates drift.** `mcpfold sync --check` exits non-zero if a checkout's committed client
   files no longer match `mcp.config.jsonc` (someone hand-edited a client file, or forgot to fold).

## Try it

```bash
npx mcpfold sync --check     # ✓ in sync (exit 0)
# now hand-edit .cursor/mcp.json …
npx mcpfold sync --check     # ✗ drift detected (exit 1)
npx mcpfold sync             # re-fold to fix
```

Secrets are references (`${env:GITHUB_TOKEN}`), never values — the committed files are safe to
push. Set `GITHUB_TOKEN` in your environment or a local `.env`.

## Graduating to the cloud

When the repo gate isn't enough — you want a shared config across repos, an audit trail, or
per-machine revocation — the [hosted cloud](../../docs/team-config-as-code.md#graduating-to-the-cloud)
takes the **same** `mcp.config.jsonc` format. Nothing about your config changes.
