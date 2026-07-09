# PROGRESS

Ralph/Claude loop progress log. One entry per story, newest at the bottom of each story block.

---

## S19.1 — Adapter wave 1: JetBrains AI Assistant, Visual Studio, Continue, Roo Code

**Started** 2026-07-09 · branch `story/S19.1-adapter-wave-1` · priority p1, deps: none.

**Done** 2026-07-09.

Added four first-class client adapters (client count 8 → 12), each folding from the one canonical
config. Formats verified against primary docs at implementation time (July 2026):

- **JetBrains** (`jetbrains`, shim, no restart) — AI Assistant takes a `mcpServers`-shaped paste-in
  JSON (with Import-from-Claude) and does not persist a stable user file; the JetBrains agent surface
  (Junie) reads the same JSON from disk, so we fold to `~/.junie/mcp/mcp.json` (user) and
  `<project>/.junie/mcp/mcp.json` (project). Reuses `createMcpServersAdapter`.
- **Visual Studio** (`visual-studio`, native-input, no restart) — reads the **VS Code dialect**
  (`servers` root + `inputs`), so it reuses `vscodeAdapter`'s render/parse verbatim and only overrides
  path resolution. Targets `~/.mcp.json` (user) and `<project>/.mcp.json` (solution) — deliberately
  NOT `.vscode/mcp.json` or `.cursor/mcp.json`, which the vscode/cursor adapters own (no double-write).
  A test asserts it never resolves to a vscode/cursor-owned file.
- **Continue** (`continue`, shim, no restart) — Continue auto-loads Claude-style JSON dropped into
  `.continue/mcpServers/`, so we fold to `mcpfold.json` there (`~/.continue/mcpServers/` user,
  `<project>/.continue/mcpServers/` project) — no YAML dependency needed. shim for now; native
  `${{ secrets.NAME }}` interpolation is deferred to S19.4.
- **Roo Code** (`roo-code`, shim, no restart) — Cline fork; global storage file
  `<VS Code User>/globalStorage/rooveterinaryinc.roo-cline/settings/cline_mcp_settings.json` (user)
  and `<project>/.roo/mcp.json` (project). Reuses `createMcpServersAdapter`.

Also: `CLIENT_IDS` + JSON schema regenerated (12 clients), `ALL_ADAPTERS`/registry updated,
`detect-clients` picks up all four automatically (maps `ALL_ADAPTERS`), matrix goldens + compat
samples captured, per-OS path + render→parse tests per adapter, `docs/coverage.md` table and notes
updated.

`verify_all` green: lint + core-purity, typecheck (all 8 workspaces), `pnpm -r test`
(core 74, adapters 93, cli 208, schema 6, secrets 35, proxy 47, security 8, e2e 10), and `pnpm -r build`.

**Out-of-scope tree repair (pre-existing reds on `main`, unrelated to E19; fixed so the story could
land on a genuinely green suite):**

- `security/leak.test.ts` + `e2e/team-config.test.ts`: `TrustGate` mock/await drift from S18.1 —
  broke repo-wide `pnpm typecheck`. Conformed the mock and awaited the now-async `runTrust`.
- `e2e/deploy-env.test.ts` (S8.5): the deployment runbook was missing 8 real env vars
  (`POSTGRES_DB`, `JWT_EXPIRY`, `REALTIME_ENC_KEY`, `REALTIME_SECRET_KEY_BASE`, `GITHUB_OAUTH_ENABLED`,
  `DISABLE_SIGNUP`, `PORT`). Documented them in `docs/deployment.md` §Step 3/§Step 5.
- CI `docs` gate (`docs:build` link-checker) and the `core purity` gate's Prettier `--check` step —
  both run in CI but NOT in `verify_all`, so they only surfaced on the PR. Fixed a broken in-doc
  anchor and ran `prettier --write` on 5 pre-existing-unformatted files (`.github/FUNDING.yml`,
  `.github/ISSUE_TEMPLATE/bug_report.md`, `docs/seo/homepage-copy.md`, `scripts/build-binary.mjs`,
  `scripts/render-packaging.mjs`) plus this story's own docs/tests.

**Follow-ups (not blocking S19.1):**

- `compat/run.ts` flags a **pre-existing** gemini-cli divergence: its captured sample lacks `httpUrl`
  (adapter renders `httpUrl` for streamable-http per S17.3). The compat harness is a separate
  scheduled job (not in `verify_all`), so it does not gate CI — but the gemini-cli sample should be
  re-captured (`npx tsx compat/run.ts --capture`) in a follow-up.
- S19.2 (adapter wave 2), now unblocked, and S19.4 (native-interpolation secrets, would upgrade
  Continue/VS from shim to native refs).
