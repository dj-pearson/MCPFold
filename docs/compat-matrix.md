# Client compatibility matrix

Generated from the mcpfold compat harness — the **last-verified** dates are the harness sample
capture dates, not hand-edited. Drift is caught weekly (see
[adapter coverage](./coverage.md) and `.github/workflows/adapter-compat.yml`).

_Generated 2026-07-09 · 18 clients._

| Client | Format | Scopes | Remote transport | Secret strategy | Last verified |
| ------ | ------ | ------ | ---------------- | --------------- | ------------- |
| claude-code | json | user, project | native `type+url` | shim (native-env available) | 2026-07-09 |
| claude-desktop | json | user | mcp-remote shim | shim | 2026-07-09 |
| cline | json | user | native `url` | shim | 2026-07-09 |
| codex-cli | toml | user | native `url` | shim | 2026-07-09 |
| continue | json | user, project | native `url` | shim | 2026-07-09 |
| copilot-cli | json | user | native `type+url` | shim (native-env available) | 2026-07-09 |
| cursor | json | user, project | native `url` | shim (native-env available) | 2026-07-09 |
| gemini-cli | json | user, project | native `httpUrl` | shim (native-env available) | 2026-07-09 |
| goose | yaml | user | native `url` | shim | 2026-07-09 |
| jetbrains | json | user, project | native `url` | shim | 2026-07-09 |
| lm-studio | json | user, project | native `url` | shim | 2026-07-09 |
| opencode | json | user, project | native `url` | shim (native-env available) | 2026-07-09 |
| roo-code | json | user, project | native `url` | shim | 2026-07-09 |
| visual-studio | json | user, project | native `type+url` | native-input | 2026-07-09 |
| vscode | json | user, project | native `type+url` | native-input | 2026-07-09 |
| warp | json | user, project | native `url` | shim (native-env available) | 2026-07-09 |
| windsurf | json | user | native `url` (shim if authed) | shim (native-env available) | 2026-07-09 |
| zed | json | user, project | native `url` | shim | 2026-07-09 |
