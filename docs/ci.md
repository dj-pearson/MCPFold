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

## Branch protection (required setup)

The `main` branch must be protected so that **CI must be green to merge**. Configure in
GitHub → Settings → Branches → Branch protection rules for `main`:

- ✅ Require a pull request before merging.
- ✅ Require status checks to pass before merging, and mark these as **required**:
  - `verify (ubuntu-latest · node 20)`
  - `verify (macos-latest · node 20)`
  - `verify (windows-latest · node 20)`
  - `core purity`
- ✅ Require branches to be up to date before merging.
- ✅ Do not allow bypassing the above settings.

Trunk-based flow: each story is a short-lived branch merged to `main` via a PR that
passes CI. No story is `done` until the full matrix is green.
