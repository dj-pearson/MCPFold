# Team config-as-code

Standardize your team's MCP setup from a **repo-committed config**, with a CI gate that fails on
drift — no backend, no accounts. This is the collaboration wedge between the single-user CLI and
the [hosted cloud](#graduating-to-the-cloud): the same `mcp.config.jsonc`, versioned in git.

A complete worked example lives in [`examples/team-repo/`](../examples/team-repo/).

## The convention

1. **Commit one `mcp.config.jsonc` at the repo root** — the team's source of truth. Use
   **project-scope** profiles so the folded client files land inside the repo and are committed too:

   ```jsonc
   {
     "profiles": {
       "vscode-project": {
         "client": "vscode",
         "scope": "project",
         "path": ".",
         "include": ["code"],
       },
       "cursor-project": {
         "client": "cursor",
         "scope": "project",
         "path": ".",
         "include": ["code"],
       },
     },
   }
   ```

   `path: "."` resolves to the repo root, so `mcpfold sync` (run from there) writes
   `.vscode/mcp.json` and `.cursor/mcp.json` into the repo.

2. **Commit the folded client files** alongside the canonical config. They are what CI compares
   against, and they let a fresh clone open in-editor without folding first.

3. **Secrets stay references.** Servers carry `${env:…}` / `${op:…}` references, never values, so
   the committed files are safe to push. Each developer supplies the actual secret via their
   environment or a local (git-ignored) `.env`.

## The CI drift gate

`mcpfold sync --check` (equivalently `mcpfold diff --check`) writes nothing and **exits non-zero
when a checkout's committed client files would drift** from `mcp.config.jsonc` — someone hand-edited
`.vscode/mcp.json`, or changed the canonical config without re-folding. It resolves no secret
values, so CI needs no tokens.

```yaml
- run: npx --yes mcpfold sync --check
```

See [`examples/team-repo/.github/workflows/mcp-drift.yml`](../examples/team-repo/.github/workflows/mcp-drift.yml).

## Trust: reviewing a teammate's launch command

mcpfold never executes a launch command that hasn't been approved on your machine
([config-as-code TOFU, S9.2](./security.md)). When a teammate commits a **new or changed**
executable server, the first local `mcpfold run` refuses it until you review and trust it:

```bash
npx mcpfold trust            # review + approve every new/changed launch command
npx mcpfold trust github     # or approve one server
```

`mcpfold trust` (no name) approves all currently-untrusted servers non-interactively — this is the
**`--yes`-equivalent for CI or scripted provisioning**, after a human has reviewed the diff. Trust
is per machine, so a compromised commit can't silently run code on a teammate's box.

## Org policy: allow/deny lists (S18.3)

Where trust is a **per-machine** approval, an org policy is **org-level intent** — a platform or
security team publishes one `mcp.policy.jsonc` that mcpfold enforces on every developer machine and
in CI, cross-client. **Deny always wins over local trust:** a denied server can't be run, added, or
folded even if a developer trusted it.

A rule matches by server `name`, npm `package` prefix, registry `namespace` (`@scope`), or a `url`
glob. `mode: "strict"` is an allow-list (only listed servers are permitted, everything else is
denied); the default `"permissive"` is a deny-list.

```jsonc
// mcp.policy.jsonc  (schema: https://mcpfold.com/schema/policy/v1.json)
{
  "$schema": "https://mcpfold.com/schema/policy/v1.json",
  "version": 1,
  "mode": "permissive",
  "deny": [
    { "namespace": "@evil", "description": "unreviewed vendor" },
    { "url": "https://*.internal.example/*", "description": "no internal MCP endpoints" },
  ],
  "allow": [{ "namespace": "@modelcontextprotocol" }], // only consulted in strict mode
}
```

**Discovery** (first found wins): the project `mcp.policy.jsonc`, then `$MCPFOLD_POLICY` (handy in
CI), then a machine-managed location for MDM-distributed policy — `%PROGRAMDATA%\mcpfold\` on
Windows, `/Library/Application Support/mcpfold/` on macOS, `/etc/mcpfold/` on Linux.

**Enforcement:** `run` and `add` refuse a denied server outright; `sync` strips denied servers from
folds with a loud warning in permissive mode, or refuses to write anything in strict mode; `sync
--check` and `scan` report every violation with its rule + policy file, and `--check` fails CI:

```yaml
# Fail the build if any managed client config would fold a non-conforming server.
- run: npx --yes mcpfold sync --check # exits non-zero on drift OR a policy violation
- run: npx --yes mcpfold scan # audits on-disk client configs + the policy
```

## Graduating to the cloud

The repo gate covers one repository. When you outgrow it — a config shared across many repos, an
**audit trail** of who changed what, **per-machine revocation**, or team roles — the
[hosted cloud](./self-hosting.md) takes over. It uses the **same `mcp.config.jsonc` format**:
`mcpfold push` sends the canonical config (references only, new version), teammates `mcpfold pull`,
and the team console adds members, roles, and the change-audit trail. Nothing about your config
changes — you graduate the _distribution_, not the _format_.
