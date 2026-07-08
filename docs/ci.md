# CI & branch protection

CI runs on every push and pull request via [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

## Jobs

- **`verify`** — matrix of `{ubuntu-latest, macos-latest, windows-latest} × node 20`.
  Each cell runs, in order: `pnpm install --frozen-lockfile`, `pnpm lint`,
  `pnpm typecheck`, `pnpm -r test --coverage`, `pnpm -r build`. Any lint, type,
  test, or build error fails the cell and the build. Path resolution differs per OS
  and is central to this product, so the three-OS matrix is non-negotiable.
- **`core-purity`** — a dedicated job that runs `scripts/check-core-purity.mjs`
  (static assertion that `packages/core` imports no `node:fs`/`node:os`/`node:path`/
  network/process modules) plus `pnpm format:check`. Independent of the lint job so a
  lint-config regression cannot hide a purity breach.
- **`docs`** — runs `pnpm docs:build` (`scripts/build-docs.mjs`), which renders the
  docs site and **fails on any broken internal link, missing required page, or invalid
  hosted schema**. The same build backs the Pages deploy, so a green `docs` job means the
  site is publishable.
- **`db integration`** — stands up the CI Supabase database
  (`supabase/docker-compose.ci.yml`), applies the migrations with
  `supabase/scripts/migrate.sh`, then runs `smoke-test.sh` (bootstrap + idempotency) and
  `test-rls.sh` (tenant isolation — user A cannot read user B's configs — append-only
  immutability, reference-only enforcement, and the audit trail). A broken migration or a
  security-policy regression fails here before it can reach the Coolify deployment. See
  [Self-hosting](./self-hosting.md).

## Docs deployment (GitHub Pages)

[`docs.yml`](../.github/workflows/docs.yml) publishes the docs site to GitHub Pages on
every push to `main`, including the generated JSON Schema at the stable path
`/schema/v1.json`. One-time setup (repo admin): **Settings → Pages → Source = "GitHub
Actions"**. The build emits a `CNAME` for `mcpfold.com`; pointing that domain's DNS at
GitHub Pages makes the schema live at `https://mcpfold.com/schema/v1.json` — the URL
`mcpfold init` writes into every scaffolded config.

## Branch protection (required setup)

The `main` branch must be protected so that **CI must be green to merge**. Configure in
GitHub → Settings → Branches → Branch protection rules for `main`:

- ✅ Require a pull request before merging.
- ✅ Require status checks to pass before merging, and mark these as **required**:
  - `verify (ubuntu-latest · node 20)`
  - `verify (macos-latest · node 20)`
  - `verify (windows-latest · node 20)`
  - `core purity`
  - `docs`
  - `db integration`
- ✅ Require branches to be up to date before merging.
- ✅ Do not allow bypassing the above settings.

Trunk-based flow: each story is a short-lived branch merged to `main` via a PR that
passes CI. No story is `done` until the full matrix is green.
