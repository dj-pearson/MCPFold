# Changelog

## Unreleased

- Added an F5 dev loop (`.vscode/launch.json` + `tasks.json`) with an esbuild watch build and a
  bundled `fixtures/smoke-workspace` so the status bar has real config to check against.
- Downsized the Marketplace icon to 128px (was a 1024px, ~500 KB asset that `vsce` flagged); the
  full-resolution source is kept as `media/icon-source-1024.png` and excluded from the `.vsix`.
- Documented the smoke-test checklist and Marketplace publish runbook in `PUBLISHING.md`.
- Added an inline **tool-token-budget CodeLens** on `mcp.config.jsonc`: each server shows its
  estimated tool-schema token cost and the file shows a total, each opening the web token calculator.
  Estimates reuse the committed benchmark method and are labeled approximate until real `tools/list`
  data is collected; toggle with the `mcpfold.showTokenBudget` setting.

## 0.1.0

- Initial release.
- Commands: Sync, Diff, Import, Doctor, Init, Check sync status, Show actions, Open token calculator.
- Status-bar drift indicator driven by `mcpfold sync --check`, refreshed on config save.
- CLI auto-detection with an `npx mcpfold@latest` fallback; `mcpfold.path` / `mcpfold.useNpx` /
  `mcpfold.checkDriftOnSave` settings.
