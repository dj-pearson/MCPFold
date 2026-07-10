# WinGet packaging

These three manifests are the source of truth for the `PearsonMedia.mcpfold` package in
[microsoft/winget-pkgs](https://github.com/microsoft/winget-pkgs). Their `PackageVersion` is kept
in lockstep with npm by `scripts/sync-packaging-version.mjs` (wired into the Changesets version
step) and enforced by `scripts/check-version-parity.mjs`. At publish time
`scripts/render-packaging.mjs` fills the real `InstallerUrl` + `InstallerSha256` into
`dist-packaging/winget/`, and the release workflow submits that folder to winget-pkgs.

## First submission (one-time, manual)

A brand-new package must be introduced to winget-pkgs before the automated updates work:

1. Create a **classic PAT** (or fine-grained token) that can fork repos and open PRs, and add it as
   the repo secret **`WINGET_TOKEN`**. (Automated updates are skipped until this exists.)
2. Cut a release so `dist-packaging/winget/` has real hashes (or fill `InstallerSha256` here from the
   release's `mcpfold-windows-x64.exe.sha256`).
3. Submit once:
   ```sh
   wingetcreate submit --token <PAT> dist-packaging/winget
   ```
   New packages go through Microsoft moderation on the first PR; follow the winget-pkgs PR checks.

After that first accepted PR, every release auto-submits an update via the `publish-assets` job.
