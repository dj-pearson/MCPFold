---
'mcpfold': minor
---

Add terminal color and two "how is the tool running" commands. Human output is now colorized when
stdout is a real terminal — pipes, redirects, and `--json` stay byte-stable, so color is purely a
display concern that never touches the machine surface. Color respects `NO_COLOR`, `FORCE_COLOR`,
`MCPFOLD_NO_COLOR`, and `TERM=dumb`. `status` and `doctor` now use it for their ✓/•/⚠/✖ markers, and
the update notice is colorized too. Two new read-only commands: `mcpfold info` prints an environment
snapshot (version, install channel, config path, config dir, telemetry / update-notifier opt-in
state, last update check, detected client counts) — the block to paste into a bug report; and
`mcpfold update` checks the registry on demand and prints the upgrade command matched to your install
channel (npm / Homebrew / Scoop / standalone binary) without installing anything. Both support `--json`.
