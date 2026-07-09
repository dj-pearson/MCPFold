# PROGRESS

Ralph/Claude loop progress log. One entry per story, newest at the bottom of each story block.

---

## S19.1 — Adapter wave 1: JetBrains AI Assistant, Visual Studio, Continue, Roo Code

**Started** 2026-07-09 · branch `story/S19.1-adapter-wave-1` · priority p1, deps: none.

**Done** 2026-07-09.

Added four first-class client adapters (client count 8 → 12), each folding from the one canonical
config. Formats verified against primary docs at implementation time (July 2026):

- **JetBrains** (`jetbrains`, shim, no restart) — AI Assistant takes a `mcpServers`-shaped paste-in
  JSON (with Import-from-Claude) and does not persist a stable user file; the JetBrains agent surface
  (Junie) reads the same JSON from disk, so we fold to `~/.junie/mcp/mcp.json` (user) and
  `<project>/.junie/mcp/mcp.json` (project). Reuses `createMcpServersAdapter`.
- **Visual Studio** (`visual-studio`, native-input, no restart) — reads the **VS Code dialect**
  (`servers` root + `inputs`), so it reuses `vscodeAdapter`'s render/parse verbatim and only overrides
  path resolution. Targets `~/.mcp.json` (user) and `<project>/.mcp.json` (solution) — deliberately
  NOT `.vscode/mcp.json` or `.cursor/mcp.json`, which the vscode/cursor adapters own (no double-write).
  A test asserts it never resolves to a vscode/cursor-owned file.
- **Continue** (`continue`, shim, no restart) — Continue auto-loads Claude-style JSON dropped into
  `.continue/mcpServers/`, so we fold to `mcpfold.json` there (`~/.continue/mcpServers/` user,
  `<project>/.continue/mcpServers/` project) — no YAML dependency needed. shim for now; native
  `${{ secrets.NAME }}` interpolation is deferred to S19.4.
- **Roo Code** (`roo-code`, shim, no restart) — Cline fork; global storage file
  `<VS Code User>/globalStorage/rooveterinaryinc.roo-cline/settings/cline_mcp_settings.json` (user)
  and `<project>/.roo/mcp.json` (project). Reuses `createMcpServersAdapter`.

Also: `CLIENT_IDS` + JSON schema regenerated (12 clients), `ALL_ADAPTERS`/registry updated,
`detect-clients` picks up all four automatically (maps `ALL_ADAPTERS`), matrix goldens + compat
samples captured, per-OS path + render→parse tests per adapter, `docs/coverage.md` table and notes
updated.

`verify_all` green: lint + core-purity, typecheck (all 8 workspaces), `pnpm -r test`
(core 74, adapters 93, cli 208, schema 6, secrets 35, proxy 47, security 8, e2e 10), and `pnpm -r build`.

**Out-of-scope tree repair (pre-existing reds on `main`, unrelated to E19; fixed so the story could
land on a genuinely green suite):**

- `security/leak.test.ts` + `e2e/team-config.test.ts`: `TrustGate` mock/await drift from S18.1 —
  broke repo-wide `pnpm typecheck`. Conformed the mock and awaited the now-async `runTrust`.
- `e2e/deploy-env.test.ts` (S8.5): the deployment runbook was missing 8 real env vars
  (`POSTGRES_DB`, `JWT_EXPIRY`, `REALTIME_ENC_KEY`, `REALTIME_SECRET_KEY_BASE`, `GITHUB_OAUTH_ENABLED`,
  `DISABLE_SIGNUP`, `PORT`). Documented them in `docs/deployment.md` §Step 3/§Step 5.
- CI `docs` gate (`docs:build` link-checker) and the `core purity` gate's Prettier `--check` step —
  both run in CI but NOT in `verify_all`, so they only surfaced on the PR. Fixed a broken in-doc
  anchor and ran `prettier --write` on 5 pre-existing-unformatted files (`.github/FUNDING.yml`,
  `.github/ISSUE_TEMPLATE/bug_report.md`, `docs/seo/homepage-copy.md`, `scripts/build-binary.mjs`,
  `scripts/render-packaging.mjs`) plus this story's own docs/tests.

**Follow-ups (not blocking S19.1):**

- `compat/run.ts` flags a **pre-existing** gemini-cli divergence: its captured sample lacks `httpUrl`
  (adapter renders `httpUrl` for streamable-http per S17.3). The compat harness is a separate
  scheduled job (not in `verify_all`), so it does not gate CI — but the gemini-cli sample should be
  re-captured (`npx tsx compat/run.ts --capture`) in a follow-up.
- S19.2 (adapter wave 2), now unblocked, and S19.4 (native-interpolation secrets, would upgrade
  Continue/VS from shim to native refs).

---

## S20.1 — Decide and implement the `.mcp.json` interop strategy

**Started** 2026-07-09 · branch `story/S20.1-mcp-json-interop` · priority p1, deps: none.

**Done** 2026-07-09.

**Decision: option (b)** — `mcp.config.jsonc` stays the single canonical format (a superset with
profiles/tags/secret-refs the flat file can't express); `.mcp.json` becomes a first-class
**import source + export target**. Full rationale in `docs/adr/mcp-json-interop.md` (ADR 0001).
Rejected (a) alternate-canonical-filename (collides with claude-code's own project target and
throws away profiles/tags/refs) and (c) status quo (reads as fighting the emerging standard).

Implemented:

- **`mcpfold export --mcp-json`** (new command, `packages/cli/src/commands/export.ts`) — renders
  every server (or one `--profile`) to a flat `.mcp.json`. Bearer/header/env secret refs are
  preserved as env interpolation where possible (`${env:NAME}` → `${NAME}`); non-env schemes
  (`infisical`/`op`/`keychain`/`dotenv`) are left verbatim and **reported** (never downgraded to a
  value). Refuses to write onto a canonical filename; `--force`/`--dry-run`/`-o` supported.
- **`mcpfold import`** extended — a bare `<cwd>/.mcp.json` is adopted as a first-class source (tag +
  profile `mcp-json`), `${VAR}` → canonical `${env:VAR}`. Refactored the per-source merge into a
  shared `ingestSource`. Also hardened `redactSecrets` to never destroy a value that already embeds
  a ref (e.g. `Authorization: Bearer ${env:X}`).
- **north_star** updated (prd meta): "own" → "steward the neutral config format — canonical
  `mcp.config.jsonc`, first-class `.mcp.json` interop."
- Docs: ADR 0001 + a "Relationship to `.mcp.json`" section in `docs/config-format.md` (one paragraph
  a stranger can repeat). `init` and guided flows now point at import/export of `.mcp.json`.

Tests: `export.test.ts` (all-servers, env-vs-non-env ref handling, `--profile`, `--dry-run`,
overwrite guard, canonical-filename guard, export→import round-trip) + `import.test.ts` (bare
`.mcp.json` pickup, `${VAR}` normalization, unreadable-file skip). Completion snapshots + the
`--help` command-list test updated for the new `export` command.

`verify_all` green (lint + purity, typecheck ×8 workspaces, `pnpm -r test` — cli now 218, +10 —
and `pnpm -r build`), plus `docs:build` link-check and Prettier `--check`. End-to-end smoke-tested
against the built binary (`export --mcp-json` → `import` round-trip).

**Out-of-scope tree repair (pre-existing CI bug exposed by this story):** the new `init` next-steps
lines changed the golden terminal demo, so `demo/mcpfold.cast` + both `demo.svg` copies were
regenerated (`pnpm demo:record`). Regenerating `apps/site/public/demo.svg` triggered the `site.yml`
workflow, which has been red on **every** `main` commit for days. Two chronic bugs fixed: (1) it
built the site without its workspace deps (`pnpm --filter @mcpfold/site build`) so it couldn't
resolve `@mcpfold/core`'s dist → `--filter "@mcpfold/site..."` (deps-first, like `pages.yml` for
`@mcpfold/web`); (2) the Lighthouse config's `staticDistDir` pointed at `dist` (repo root) instead of
`apps/site/dist`. This unblocks the site pipeline for the remaining E13/E15 site stories too.

**Follow-ups (not blocking):** S20.2 (Stripe billing) and S20.3 (SSO) remain; S19.4 would let
export target native `${{ secrets }}` interpolation for Continue instead of shim.

---

## S17.2 — Per-client native-remote vs mcp-remote-shim decision matrix

**Started** 2026-07-09 · branch `story/S17.2-remote-capability-matrix` · priority p1, deps: S17.1.

**Done** 2026-07-09.

`mcp-remote` is explicitly transitional, so mcpfold now folds a remote server to each client's own
native entry wherever it can and bridges with the pinned shim only for the residue — driven by an
explicit per-adapter capability, not ad-hoc per-adapter code.

- **Capability contract:** `ClientAdapter.remote: { nativeHttp, nativeOauth, fieldShape }` (new in
  `types.ts`), declared for all 12 adapters (verified against primary docs). Shim predicate
  (`remoteNeedsShim`): a server is bridged only when it's remote **and** (`!nativeHttp` OR
  `authed && !nativeOauth`).
- **Unified shim path:** `renderRemoteShim` / `parseRemoteShim` / `remoteNeedsShim` live in the
  shared factory; `createMcpServersAdapter` renders native-or-shim per capability and reverses shims
  on parse. **Windsurf** collapsed from ~130 bespoke lines to the factory + its capability.
- **Correctness fix:** **Claude Desktop**'s config is stdio-only (verified — remotes go through the
  Connectors UI, not the file), so it was previously emitting a `url` entry it can't read. It now
  correctly shims **all** remotes (`nativeHttp: false`). Native clients (Claude Code/Cursor/VS
  Code/Zed/…) emit their native remote entry.
- **`mcpfold run`:** added `planRemoteRun` — the explicit seam that prefers a direct connection but
  falls back to the pinned bridge, because the CLI ships no native HTTP transport (adding one would
  mean a heavy dep + more attack surface, against this story's own goal).
- Docs: `docs/coverage.md` gains a **Remote transport** column + the capability explainer. Matrix
  goldens updated (only claude-desktop changed — now a shim); compat sample updated.

Tests: new `remote-capability.test.ts` (capability metadata, shim predicate, native-vs-shim per
client, unauth-vs-authed, **capability-override flips the form**, shim round-trip) + a `planRemoteRun`
unit test. Adapters 100 (+7), CLI 219 (+1).

`verify_all` green (lint + purity, typecheck ×8 workspaces, `pnpm -r test`, `pnpm -r build`), plus
`docs:build`, Prettier `--check`, and no demo drift. End-to-end smoke-tested against the built
adapters (native `type+url` for Claude Code; shim for Claude Desktop + authed Windsurf).

**Follow-ups (not blocking):** S17.5 (schema v2 naming), S17.7 (registry), and the still-open
pre-existing gemini-cli compat-sample drift (re-capture; the compat harness is a separate scheduled
job, not part of `verify_all`).

---

## S20.2 — Wire Stripe billing into the entitlement stub

**Started** 2026-07-09 · branch `story/S20.2-stripe-entitlements` · priority p1, deps: none.

**Done** 2026-07-09 (mock-mode; no live Stripe keys — verified via Deno unit tests, web e2e mock,
and CI's db-integration for the RLS + live-DB paths).

The stub granted `team` to everyone; that grant is **gone**. Team cloud features are now gated by a
real, Stripe-backed, **fail-closed-to-free** entitlement per team.

- **Edge (Deno):**
  - `lib/entitlements.ts` rewritten: `dbEntitlementChecker` reads `public.entitlements` and returns
    the stored tier only while the subscription is active-ish; missing/inactive/error → `cloud-free`
    (never `team`). `requireEntitlement` guard.
  - `lib/stripe.ts` (new): webhook **signature verification** via WebCrypto HMAC-SHA256 (Stripe's
    `t=…,v1=…` scheme with replay-tolerance) — no SDK, fully offline-testable; `tierForPriceId`; an
    injectable `StripeClient` (live REST client for Checkout/Portal, faked in tests).
  - `functions/billing/` (new): `POST …/billing/webhook` (signature-verified, **idempotent** via a
    `billing_events` PK ledger, upserts entitlements from `customer.subscription.*`), `checkout` +
    `portal` (owner-gated Stripe URLs), `entitlement` (RLS-read tier). Wired into `server.ts`.
  - `functions/teams`: inviting members now returns **402** unless the team has the `team-config`
    entitlement (enforced only when the checker is injected — the production router always does).
- **Migration `0007_entitlements.sql`:** `entitlements` (one row/team, tier + Stripe ids) and
  `billing_events` (idempotency ledger), both RLS-enabled. Members can READ their team's entitlement;
  no client write policy (webhook writes as the BYPASSRLS service connection); `billing_events` is
  not client-accessible. RLS asserted in `test-rls.sh`.
- **Web:** `TeamConsole` shows the tier badge, gates the invite form on the free tier with an
  **Upgrade** (Checkout) CTA, and a **Manage billing** (Portal) link on paid tiers; `teamsApi` gains
  `entitlement`/`checkout`/`portal`. The teams e2e now drives the full free → upgrade → team flow.
- **CLI stays ungated:** new `e2e/cli-ungated.test.ts` structurally asserts the OSS CLI imports no
  entitlement/billing code — a paywall can never leak into the free tool.
- **Docs:** `pricing-model.md` §Billing rewritten from "not yet integrated" to the implemented
  behavior; the four optional `STRIPE_*` env vars documented in `deployment.md`.

Verification: `deno test` (26 passed — 12 new billing tests: signature valid/wrong/tampered/replay,
tier fail-closed, webhook idempotency, subscription.deleted downgrade, owner-gated checkout, invite
402/allow), teams playwright e2e (green), `pnpm -r test` (all packages), lint + typecheck ×8 +
Prettier + `docs:build` + deploy-env. The RLS migration + full DB-backed edge tests run in CI's
db-integration job (which stands up Postgres — not runnable locally).

**Follow-ups (not blocking):** pending-invite redemption + SSO (S20.3); a live-Stripe smoke test in a
dedicated environment; per-seat pricing if the team tier moves from per-team to per-member.

---

## S18.3 — Org-managed policy: server allow/deny lists enforced at sync, add, and run

**Started** 2026-07-09 · branch `story/S18.3-org-policy` · priority p1, deps: none.

**Done** 2026-07-09 (CLI-side, fully local-verified).

An org can now publish ONE `mcp.policy.jsonc` that mcpfold enforces on every dev machine and in CI,
cross-client — the control the individual clients only ship walled. **Deny always wins over local
trust** (policy is org intent; TOFU stays the per-machine approval).

- **`packages/core/src/policy.ts` (new, pure):** versioned zod schema; rules match by `name` /
  `package` prefix / `namespace` (`@scope`) / `url` glob (AND over a rule's matchers);
  `mode: strict` (allow-list) vs `permissive` (deny-list, default). One shared `evaluatePolicy`
  (deny → `not-allowlisted` in strict → permitted), with package/namespace extraction from runner
  args. Exported from core.
- **Published schema:** `packages/schema` generates + commits `mcp.policy.schema.json`, served at
  `/schema/policy/v1.json` (staged by the docs build), drift-checked like the config schema.
- **CLI discovery (`util/policy.ts`):** first-found of project `mcp.policy.jsonc` → `$MCPFOLD_POLICY`
  → machine-managed location (per-OS: `%PROGRAMDATA%`/`/Library/Application Support`/`/etc`). One
  `checkServer` + `describeViolation` (carries rule + file provenance).
- **Enforcement (one evaluator, four call-sites):** `run` and `add` refuse a denied server outright;
  `sync` strips denied servers + warns (permissive) or refuses to write anything (strict); `sync
--check` exits nonzero on a violation and `scan` reports it — both with rule + policy-file
  provenance.
- **Docs:** `docs/team-config-as-code.md` gains the org-policy story with an example policy file,
  discovery/precedence, and a CI snippet.

Tests: `core/test/policy.test.ts` (matchers, namespace/package extraction, strict/permissive,
deny-wins, schema rejection) + `cli/test/policy.test.ts` (discovery precedence, sync strip/strict-
fail/`--check` provenance, add refuse, run refuse **deny-wins-over-trust** + allow) + schema drift.
`verify_all` green (lint+purity, typecheck ×8, `pnpm -r test` — core 12 files, cli 33 — build),
plus `docs:build`, Prettier, deploy-env.

**Follow-ups (not blocking):** S17.7 (registry) will let `add --from-registry` reuse the same
evaluator; a managed-machine "policy cannot be overridden by a project file" hard-lock mode if orgs
want it stricter than first-found-wins.

---

## S17.5 — Schema v2: streamable-http, oauth marker, sse deprecation (first real migration)

**Started** 2026-07-09 · branch `story/S17.5-schema-v2` · priority p1, deps: none.

**Done** 2026-07-09 (core/schema, fully local-verified incl. an end-to-end `mcpfold migrate` smoke).

`SCHEMA_VERSION` is now **2**, modeling today's transport/auth reality — and it's the **first real
migration**, proving the v1 migration infra end to end.

- **Transports:** canonical remote transport is `streamable-http` (the spec's Streamable HTTP;
  HTTP+SSE deprecated 2025-11-25). `http` is accepted as an alias and canonicalized on load (zod
  `preprocess`). `sse` still loads/folds but `doctor` warns (new `checkDeprecatedTransports`).
- **`auth.type: 'oauth'`** — a declarative marker (no token/headers): the client runs OAuth 2.1
  itself. Adapters fold it to a bare native remote (no auth material), it's never shimmed
  (`remoteNeedsShim` now treats only static bearer/header auth as shim-forcing), and `doctor` pushes
  no token at it.
- **Real 1→2 migration** (replacing the worked example): bumps version + rewrites `http` →
  `streamable-http`, lossless. `loadConfig` auto-migrates a v1 file **in-memory** so it keeps
  loading; `mcpfold migrate` persists the upgrade with a backup.
- **Adapters:** parse-returns now yield the canonical `streamable-http`; render still emits each
  client's dialect (`type: http` / bare `url` / `httpUrl`), so **matrix goldens are unchanged**.
- **Published schema:** committed schema regenerated (v2, `$id .../schema/v2.json`); the docs build
  serves it at `/schema/v2.json` and keeps `/schema/v1.json` resolving so old `$schema` pointers work.
- **Docs:** `config-format.md` updated (transports, `oauth`, sse deprecation, v2 versioning/migration).

Tests: core migration (http→streamable-http, stdio/sse untouched, round-trip), schema (`http` alias
canonicalizes, `oauth` validates, version const 2, JSON-schema drift), adapters (all 100 green, incl.
oauth-not-shimmed), CLI (`migrate` v1→v2 persists + backs up, `doctor` sse-warns/oauth-clean, `add`
creates streamable-http). Swept ~40 typed `version:1`/`transport:'http'` literals across core/cli/
web/secrets/security to v2/streamable-http (runtime tests passed via esbuild; `tsc`/build caught the
typed ones). `verify_all` green (lint+purity, typecheck ×8, `pnpm -r test`, build) + docs:build +
Prettier + demo drift + an end-to-end `migrate`+`doctor` smoke on a real v1 file.

**Follow-ups (not blocking):** a frozen v1 JSON-schema snapshot if strict per-version autocomplete is
ever wanted (today both URLs serve the current schema); adapters could emit a client-specific OAuth
hint field for clients that want one.

---

## S17.7 — Official MCP registry integration: `add --from-registry` and `search`

**Started** 2026-07-09 · branch `story/S17.7-registry` · priority p1, deps: none.

**Done** 2026-07-09 (CLI-side; unit + integration tested, and **smoke-tested live against the real
registry**).

One command turns an official-registry listing into the **safest possible** canonical entry —
pinned to an exact version, integrity-hashed where available, every secret a reference, never a
value. No competitor in the sync niche does this mapping.

- **`registry/client.ts`** — client for `registry.modelcontextprotocol.io` (frozen v0 API).
  Injectable `fetch`; base URL overridable via `MCPFOLD_REGISTRY_URL` (subregistries/mirrors);
  `search(query)` + `getByName(name)` (exact, latest). Network failure → actionable offline error
  (S0.9), **nothing written**.
- **`registry/map.ts`** (pure) — `server.json` (2025-12-11) → canonical: `packages[]`
  (npm→npx / pypi→uvx / oci→docker …) with `pin` = exact version and `integrity` (SRI from an mcpb
  `fileSha256`); `remotes[]` (streamable-http/sse) → remote server; `environmentVariables`/`headers`
  with `isSecret` → `${scheme:NAME}` **references**. **Refuses** an unpinnable package or a raw
  secret value (even when the listing ships a secret `default`).
- **`mcpfold add <name> --from-registry`** — fetch → map → org-policy gate → comment-preserving
  insert under a derived local key (`--as` to override). `--secret-scheme env|dotenv|infisical|
keychain|op` (or an interactive prompt).
- **`mcpfold search <query>`** — human + `--json` list of matching servers.
- **`docs/registry.md`** — the full `server.json` → `mcp.config` mapping table, subregistry override,
  offline behavior.

Tests: `registry.test.ts` (19) — mapper (npm/pypi/oci/mcpb/remotes, isSecret→ref, refusal paths,
no-raw-value-even-with-default), client (search/getByName, base-URL override, offline + non-ok
errors), and `add --from-registry`/`search` integration (derived key, `--as`, no-write-on-failure).
Completion snapshots + `--help` list updated for the new `search` command.

`verify_all` green (lint+purity, typecheck ×8, `pnpm -r test` — cli 34 files/248 — build), plus
`docs:build`, Prettier, deploy-env. **Live smoke**: `search github` and
`add ai.smithery/smithery-ai-github --from-registry` against the real registry produced a
`streamable-http` server with the secret header as `${env:Authorization}` — never a value.

**Follow-ups (not blocking):** a `--package`/`--remote` selector when a listing has several; caching
registry responses for offline reuse.
