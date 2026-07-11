# Publishing & smoke-testing the mcpfold VS Code extension

Maintainer runbook for the `mcpfold-vscode` extension. Covers the F5 dev loop, the manual
smoke-test checklist that gates a release, and the Marketplace publish steps. This file is
excluded from the packaged `.vsix` (see `.vscodeignore`) and from the public docs site.

The extension is a thin front-end over the `mcpfold` CLI — it shells out and reflects the CLI's
[stable exit codes](../../docs/cli-contract.md#exit-codes-s010) (`0` in sync, `1` drift/diff,
`2` error). It must never disagree with `mcpfold sync`, so the smoke test verifies the wiring,
not CLI behavior.

## 1. Dev loop (F5)

1. `pnpm install` at the repo root (or `pnpm install --filter mcpfold-vscode`).
2. Open the `apps/vscode-extension` folder in VS Code.
3. Press **F5** and pick a launch config (see `.vscode/launch.json`):
   - **Run mcpfold extension** — Extension Development Host with no folder open.
   - **Run mcpfold extension (open a config workspace)** — opens `fixtures/smoke-workspace`,
     which ships a minimal secret-free `mcp.config.jsonc` so the status bar has real input.
4. `preLaunchTask: "npm: watch"` (see `.vscode/tasks.json`) starts esbuild in watch mode. After
   editing `src/`, reload the host window (`Cmd/Ctrl+R`) to pick up the rebuild.

To test against a global CLI install vs. the `npx` fallback, install `mcpfold` globally
(`npm i -g mcpfold`) for the first, and either uninstall it or set `mcpfold.useNpx = true` in
the host window's settings for the second.

## 2. Smoke-test checklist (release gate)

Run in the Extension Development Host on **macOS and Windows** (the two shells differ — the CLI
spawn uses `shell: true` so `npx.cmd` / `mcpfold.cmd` resolve on Windows). Record the run in the
PR that bumps the version. A config workspace must be open for the commands to do anything.

**Commands** — each streams to the `mcpfold` output channel and reports an outcome toast:

- [ ] `mcpfold: Init a config` — creates/updates `mcp.config.jsonc`.
- [ ] `mcpfold: Import servers from clients` — pulls existing client servers in.
- [ ] `mcpfold: Preview changes (diff)` — shows the diff; exit `1` reads as "changes detected", not an error.
- [ ] `mcpfold: Sync to all clients` — writes client files; success toast.
- [ ] `mcpfold: Doctor (health check)` — runs the health check.
- [ ] `mcpfold: Open the MCP token calculator` — opens <https://mcpfold.com/mcp-token-calculator> in a browser.
- [ ] Status-bar menu (`mcpfold: Show actions` / click the item) — quick-pick lists the actions and each dispatches.

**Status-bar states** — driven by `sync --check --json` (writes nothing):

- [ ] **In sync** — `$(check) mcpfold`, no colored background. Reach it by running Sync, then re-checking.
- [ ] **Drift** — `$(warning) mcpfold: drift`, warning background. Reach it by editing a synced client file, or removing a server from `mcp.config.jsonc` without syncing.
- [ ] **Error** — `$(error) mcpfold`, error background. Reach it with a malformed `mcp.config.jsonc` (CLI exits `2`).
- [ ] **CLI-missing** — `$(cloud-download) mcpfold`. Reach it with no global `mcpfold`, `useNpx = false`, and no network for the `npx` fallback — or temporarily point `mcpfold.path` at a nonexistent binary.
- [ ] **No folder** — `$(sync) mcpfold`, tooltip "open a folder to check sync status" (host launched with no folder).
- [ ] **On-save re-check** — with `checkDriftOnSave = true` (default), saving a `mcp.config.jsonc` re-runs the drift check.

**Build gates** (also enforced in CI — see [§4](#4-ci)):

- [ ] `pnpm --filter mcpfold-vscode typecheck` is clean.
- [ ] `pnpm --filter mcpfold-vscode build` succeeds.
- [ ] `pnpm --filter mcpfold-vscode package` produces a `.vsix` with no large-asset warning (the icon is 128px).

## 3. Marketplace publish

### One-time publisher setup

1. Sign in to the [Visual Studio Marketplace publisher hub](https://marketplace.visualstudio.com/manage)
   with the Microsoft account that owns the listing.
2. Create the publisher with **ID `PearsonMedia`** — it must match `publisher` in `package.json`
   and the WinGet publisher id used for the CLI, so all mcpfold surfaces share one identity.
3. Create an **Azure DevOps Personal Access Token** (<https://dev.azure.com> → User settings →
   Personal access tokens):
   - **Organization:** All accessible organizations.
   - **Scopes:** Custom defined → **Marketplace → Manage**.
   - Copy the token; it is shown once. Store it in a password manager, never in the repo.

### Cut a release

1. Bump `version` in `apps/vscode-extension/package.json` and add a `CHANGELOG.md` entry.
2. Re-run the [smoke-test checklist](#2-smoke-test-checklist-release-gate) if `src/` changed.
3. Publish:
   ```bash
   cd apps/vscode-extension
   export VSCE_PAT=<the Azure DevOps PAT>
   pnpm build
   npx --yes @vscode/vsce publish --no-dependencies
   ```
   `--no-dependencies` is required because this package has no runtime deps to bundle and the
   monorepo's workspace symlinks would otherwise trip `vsce`. `VSCE_PAT` authenticates the push;
   alternatively run `vsce login PearsonMedia` once and omit the env var.
4. Confirm the listing at
   `https://marketplace.visualstudio.com/items?itemName=PearsonMedia.mcpfold-vscode` renders the
   icon, README, and the AI / Other categories, and that "Install" works in a clean VS Code.

### Optional CI publish

`vsce publish` can run from CI on a tag, gated on a `VSCE_PAT` repo secret. Keep it manual until
the listing is live and the smoke test has passed on both OSes at least once — an automated first
publish can't run the manual host checks that are the whole point of the release gate.

## 4. CI

`.github/workflows/vscode-extension.yml` runs typecheck + build + `vsce package` on every change
under `apps/vscode-extension/**`, and fails if the packaged icon regresses past ~50 KB (a proxy
for "someone re-committed the 1024px source as the icon"). It does **not** publish — publishing
stays a deliberate, PAT-gated manual step per the runbook above.
