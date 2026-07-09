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

## Graduating to the cloud

The repo gate covers one repository. When you outgrow it — a config shared across many repos, an
**audit trail** of who changed what, **per-machine revocation**, or team roles — the
[hosted cloud](./self-hosting.md) takes over. It uses the **same `mcp.config.jsonc` format**:
`mcpfold push` sends the canonical config (references only, new version), teammates `mcpfold pull`,
and the team console adds members, roles, and the change-audit trail. Nothing about your config
changes — you graduate the _distribution_, not the _format_.

## Org policy: allow/deny lists enforced everywhere (S18.3)

TOFU trust catches a _changed_ launch command, but it can't stop a developer from adding a
perfectly-valid server your org hasn't vetted. An **org policy** does: publish one
`mcp.policy.json` and mcpfold enforces it on every developer machine and in CI, so ungoverned
servers can't quietly enter any client config you manage.

```jsonc
{
  "$schema": "https://mcpfold.com/schema/policy-v1.json",
  "version": 1,
  // "permissive" (default) enforces only the deny list; "strict" is allow-list-only.
  "mode": "permissive",
  "deny": [
    { "match": "namespace", "pattern": "@evilcorp", "reason": "unvetted vendor" },
    { "match": "url", "pattern": "https://*.pastebin.com/*" },
  ],
  "allow": [{ "match": "namespace", "pattern": "@modelcontextprotocol" }],
}
```

**Rules** match on `name` (glob), `package` (prefix/glob), `namespace` (the `@scope` or registry
namespace of the launched package), or `url` (glob). **Deny always wins** — over an allow rule and
over local TOFU trust. In `strict` mode a server must additionally match an `allow` rule or it is
denied (allow-list-only).

**Enforcement** is one shared evaluator, applied everywhere:

- `sync` refuses to fold a denied server (or `sync --strip-denied` folds the permitted ones and
  omits the denied ones with a loud warning);
- `add` / `add --from-registry` refuse to add a denied server;
- `run` refuses to launch a denied server — **before** the trust gate;
- `scan` and `sync --check` report violations with rule provenance (which rule, from which file).

**Discovery** looks for the policy in this order, first found wins: a project `mcp.policy.jsonc` /
`mcp.policy.json`, then `$MCPFOLD_POLICY`, then the machine-managed location
(`/etc/mcpfold/policy.json` on Linux, `/Library/Application Support/mcpfold/policy.json` on macOS,
`%PROGRAMDATA%\mcpfold\policy.json` on Windows) that an org deploys via MDM/config management.

**CI example** — fail the build if any managed config or the canonical config contains a
policy-denied server:

```yaml
- name: Enforce MCP org policy
  env:
    MCPFOLD_POLICY: ${{ github.workspace }}/mcp.policy.json
  run: |
    npx mcpfold sync --check   # exits 1 on drift OR a policy violation
    npx mcpfold scan --json    # exits 1 and lists violations with provenance
```
