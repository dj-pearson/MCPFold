# GitHub Action

`mcpfold-action` packages the [config-as-code drift gate](./team-config-as-code.md) as a reusable
Action: it runs `mcpfold doctor` + `sync --check`, annotates the PR with any findings, and fails
the job when a checkout's committed client configs drift from `mcp.config.jsonc`.

## Usage

Drop this into `.github/workflows/mcp.yml`:

```yaml
name: MCP config gate
on: [pull_request]

jobs:
  mcpfold:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dj-pearson/mcpfold@v1
        with:
          # all optional:
          version: latest # a released mcpfold version, or "latest"
          working-directory: . # where mcp.config.jsonc lives
          profile: '' # limit to one profile
          check: both # sync | doctor | both
```

That's the whole thing — no install step needed; the Action installs mcpfold itself.

## What it does

- Runs `mcpfold doctor` and `mcpfold sync --check` (read-only; resolves no secrets, so it needs no
  tokens) in the working directory.
- Turns each doctor finding and each drifted client file into a PR **annotation**, and writes a job
  **summary**.
- Sets the **job status to the CLI exit code**: `0` clean, `1` drift or findings, `2` a config
  error. So a drifted config fails the check.

## Versioning

The Action is published and tagged alongside the CLI. Pin to a **major tag** (`@v1`) to get
compatible updates, or a full version (`@v1.2.3`) to pin exactly. The `version` input controls
which **mcpfold CLI** version the Action installs, independent of the Action tag; leave it `latest`
to always gate against the newest release.

## Self-test

[`.github/workflows/action-selftest.yml`](../.github/workflows/action-selftest.yml) runs the Action
against [`examples/team-repo`](../examples/team-repo/) on every change: a clean checkout passes, and
a deliberately drifted copy fails with annotations — proving the gate before release.
