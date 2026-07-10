---
name: release-process
description: How MCPFold ships releases — Changesets + OIDC npm publish + binary/Homebrew/Scoop cascade, and the gotchas
metadata:
  type: project
---

MCPFold releases via `.github/workflows/release.yml` (Changesets, fixed/lockstep group of 6 packages: `mcpfold` + `@mcpfold/{core,adapters,proxy,schema,secrets}`).

Flow: add changeset (`pnpm changeset`) → merge to `main` → Changesets opens a "Version Packages" PR → merge THAT PR → the release job runs `changeset publish` to npm, and on success the cascade fires in the SAME run: native binaries (linux/macos/windows) → `v<version>` GitHub Release + assets → push Homebrew formula (`dj-pearson/homebrew-tap`) + Scoop manifest (`dj-pearson/scoop-bucket`) → WinGet submit (`PearsonMedia.mcpfold` → microsoft/winget-pkgs) → Docker image (`ghcr.io/dj-pearson/mcpfold`). One PR merge ships every channel.

**Install channels + their touchpoints:** each channel has an in-repo template under `packaging/<channel>/`, kept in version lockstep by `scripts/sync-packaging-version.mjs` (wired into `version-packages`) and enforced by `scripts/check-version-parity.mjs`; `scripts/render-packaging.mjs` fills real URLs/hashes at publish time. Channels: npm, homebrew, scoop, winget, cli-binary. Docker installs from npm (no template). Each published package has its own `README.md` (npm shows per-package READMEs, not the root one) — the root README is NOT published.

**Manual prerequisites for the newer channels:** (1) WinGet needs a `WINGET_TOKEN` secret (PAT that can fork + PR) AND a one-time manual first submission of the new package to winget-pkgs (see `packaging/winget/README.md`) — without the token the submit step is skipped, not failed. (2) GHCR packages default to PRIVATE on first push — set `ghcr.io/dj-pearson/mcpfold` to public + link it to the repo in package settings.

**Gotchas learned shipping 1.0.2 (2026-07-10):**

- Publishing is token-free — uses **npm OIDC Trusted Publishing**, no `NPM_TOKEN` (npm is deprecating granular/bypass-2FA tokens Aug 2026). OIDC requires **npm >= 11.5.1**; Node 20 ships npm 10.x which fails with `ENEEDAUTH`. The `release` job now runs `npm i -g npm@11` to fix this.
- A **Trusted Publisher must be configured on npmjs.com for ALL SIX packages** (repo `dj-pearson/MCPFold`, workflow `release.yml`, blank environment) or the lockstep publish 403/ENEEDAUTHs and the whole cascade is gated off. 1.0.1 shipped with only `mcpfold`'s TP set, so the 5 scoped packages were stuck at 1.0.0 until 1.0.2 healed the drift.
- npm packages are owned by account **`pearsonmedia` / dan@danpearson.net** — different from the GitHub/Google email. Must be logged into that npm account to manage trusted publishers.
- A green `workflow_dispatch` run is misleading: the `release` (publish) job is gated on `github.event_name == 'push'` && `ref == main`, so manual dispatch never publishes. Only a push to `main` publishes.
