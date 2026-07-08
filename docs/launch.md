# Launch playbook

Collateral for the v0.x OSS launch (S8.4). The headline is the **context-window tax**, not
sync — every draft below leads with the ~80% tool-schema token reduction from
[the benchmark](benchmark.md) (45 tools → 9; 7,476 → 1,497 tokens). See
[the quickstart](quickstart.md) for the `init → import → sync` loop the demos reference.

## Release mechanics

- Versioning + changelogs are driven by [Changesets](https://github.com/changesets/changesets):
  a changeset in `.changeset/` drives the version bump and per-package `CHANGELOG.md`. The
  initial-release changeset references the benchmark headline.
- `npx mcpfold` works from the published package — the release pipeline runs a **post-install
  smoke test** (`scripts/pack-smoke.mjs`) that packs every package, installs the tarballs into a
  clean project, and drives the published binary through `init → doctor → sync`, so a broken
  bin/`files`/dep can't reach npm.
- Publishing itself is gated on the `NPM_TOKEN` repo secret (see the release workflow); once set,
  merging the Changesets "Version Packages" PR publishes with provenance.

## awesome-mcp PR (draft)

> **mcpfold** — One source of truth for your MCP servers. Write `mcp.config.jsonc` once, fold it
> out to every client (Cursor, Claude Desktop, Claude Code, VS Code, Windsurf, Zed). Secrets stay
> as references and never touch disk; an optional proxy trims each server's `tools/list` to the
> tools you actually use — cutting tool-schema context by ~80% in our benchmark. MIT, local-first,
> `npx mcpfold`.

Target lists: `punkpeye/awesome-mcp-servers` (Tools / Utilities), `wong2/awesome-mcp-servers`.
Respect the "no implied MCP endorsement" copy rule — describe what it does, claim no affiliation.

## Show HN / dev.to / r/mcp (draft)

**Title:** Show HN: mcpfold – cut MCP tool-schema context ~80% and stop hardcoding secrets

**Body:**

> If you run more than a couple of MCP servers, two things bite you: every client wants its config
> in a different file with a different shape (VS Code's root key is `servers`, not `mcpServers` —
> the classic silent failure), and every server dumps its entire `tools/list` into your model's
> context whether you use those tools or not.
>
> mcpfold is a local-first CLI that fixes both. You write one neutral `mcp.config.jsonc`, and
> `mcpfold sync` folds it out to each client's native format with backups and a drift `diff`.
> Secrets are `${provider:path}` references resolved at launch (env, dotenv, Infisical, OS
> keychain, 1Password) — the plaintext value never lands in a client file. And an optional proxy
> trims each server's advertised tools to an allow/deny set: in our reproducible benchmark that
> took a 3-server setup from 45 tools / 7,476 schema tokens down to 9 tools / 1,497 — about an 80%
> cut, `pnpm --filter @mcpfold/proxy bench` to reproduce.
>
> MIT, TypeScript, cross-platform (tested on the Windows/macOS/Linux matrix). `npx mcpfold init`
> to start. Adding a new client is a one-PR adapter. Not affiliated with or endorsed by the MCP
> project — just a neutral config format we'd like to see standardized.

**Assets:** the before/after benchmark table, a 20-second `init → import → sync → diff` asciinema.

## Working-group thread (draft)

For the MCP config-portability discussion — open with running code, not a proposal:

> We've been shipping a neutral, un-branded `mcp.config.jsonc` format plus a reference
> implementation (six client adapters, secret-reference resolution, drift diff) as mcpfold. It's
> MIT and already round-trips real configs across Cursor / Claude Desktop / Claude Code / VS Code
> / Windsurf / Zed. Sharing it as a concrete starting point for portable config — happy to align
> the schema with whatever the WG converges on.

## Pre-launch checklist

- [ ] `NPM_TOKEN` repo secret set (only remaining blocker for a real publish).
- [ ] Enable GitHub Pages (Settings → Pages → Source = GitHub Actions) + point `mcpfold.com` DNS
      at Pages so `https://mcpfold.com/schema/v1.json` and the docs are live.
- [ ] CI green on the full matrix, including the post-install smoke and the security gate.
- [ ] Merge the Changesets "Version Packages" PR to publish v0.1.
- [ ] Post awesome-mcp PR, then Show HN / dev.to / r/mcp; open the WG thread.
