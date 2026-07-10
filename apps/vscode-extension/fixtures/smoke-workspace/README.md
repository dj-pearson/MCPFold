# mcpfold smoke-test workspace

A throwaway workspace used to exercise the mcpfold VS Code extension in the Extension
Development Host. It holds a minimal `mcp.config.jsonc` so the status-bar drift indicator and
every command have real input to run against, with no secrets required.

Open it by pressing **F5** on the `apps/vscode-extension` folder and picking
**"Run mcpfold extension (open a config workspace)"**. See
[`docs/vscode-extension.md`](../../../../docs/vscode-extension.md) for the full smoke-test
checklist and publish runbook.
