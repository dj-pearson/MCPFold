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

---

## S15.2 — GEO answer layer: llms.txt, extraction-friendly content, FAQ schema

**Started** 2026-07-09 · branch `story/S15.2-geo` · priority p1, deps: S15.1, S13.4.

**Done** 2026-07-09 (apps/site; prerender + site e2e green).

mcpfold's buyers research inside Claude/ChatGPT/Perplexity, so answer engines now get a clean,
structured, permission-granted surface to read and cite.

- **`/llms.txt` + `/llms-full.txt`** — generated by `apps/site/scripts/gen-llms.mjs` into dist root
  (wired into the site build). `llms.txt` = product summary + focus terms + canonical link map;
  `llms-full.txt` expands with self-contained answer units.
- **FAQPage JSON-LD + visible FAQ** — `seo/faq.ts` is the single source for both the `FAQPage`
  structured data (emitted per path via `jsonld.ts`) and a visible `<FaqSection>` on the homepage +
  `/install` + `/pricing` + `/directory`. The pricing page's old inline FAQ was unified onto this
  shared source (so JSON-LD always matches visible content). Answers are answer-first and
  self-contained (name mcpfold, definition in the first sentence).
- **`robots.txt`** — explicitly allows GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-Web,
  PerplexityBot, Perplexity-User, Google-Extended, and links the sitemap.
- **`docs/geo-playbook.md`** — the answer-first writing pattern, the robots decision, and a
  repeatable GEO-check (5 prompts to run against assistants, scored named/accurate/linked, baseline
  row recorded). Deliberately manual (answer-engine output is non-deterministic → a scripted assert
  would be flaky).

Tests: `prerender.e2e.ts` gains three GEO checks — `/llms.txt`+`/llms-full.txt` resolve with the
summary + canonical links; `robots.txt` names the AI crawlers + sitemap; homepage + core pages carry
valid `FAQPage` JSON-LD with self-contained answers in the no-JS HTML. Pricing e2e updated for the
unified FAQ text.

`verify_all` green (typecheck ×8, `pnpm -r test`, lint, Prettier, `docs:build` — 29 docs), site build
generates the artifacts, and **site e2e (18) + prerender e2e (7) pass**.

**Follow-ups (not blocking):** apply the answer-first pattern to the glossary (S15.6) and per-client
guides (S15.5) as they ship; run the first live GEO check and fill in the baseline table.

---

## S15.3 — Homepage + core-page on-page SEO and messaging

**Started** 2026-07-09 · branch `story/S15.3-seo` · priority p1, deps: S13.2, S15.1.

**Done** 2026-07-09 (apps/site; site e2e + prerender e2e green).

Reworked the homepage's on-page SEO around the focus keyword **"MCP config"** / "one config for
every MCP client", without losing the context-window-tax brand line or the committed benchmark.

- **Hero:** H1 is now keyword-first + brand — "mcpfold — one **MCP config** for every client". The
  first ~100 words (a new `hero-intro`) name MCP config, MCP servers, and the supported clients
  (Claude Code, Claude Desktop, Cursor, VS Code, Windsurf, Zed); the context-window tax + the
  committed token-savings % moved into the benchmark line right below.
- **`meta.ts`:** homepage `<title>` = "mcpfold — one MCP config for every MCP client"; description
  leads with the keyword cluster ("Manage MCP servers from one config, folded out to every MCP
  client — …") within the length budget.
- **Below-fold H2 sections** (each a keyword cluster): manage every server from one file · works
  with every MCP client (the 12 clients rendered as **crawlable links** to /docs/coverage) · curate
  tools/cut the context-window tax · secrets as references. Plus an "Explore" internal-link graph out
  to /install, /directory, /docs, /pricing.
- **`seo/keyword-map.ts`:** the in-repo keyword→page map (target term per core page, `live` vs
  `planned`), including the future /guides (S15.5) and /glossary (S15.6) pages — those homepage links
  wire in when those stories ship.

Tests: `home.e2e.ts` gains four checks — title/H1/meta contain the target terms + client names +
meta-length budget; the four H2 clusters are present; the client list renders as links; the internal
links point at /directory, /docs, /pricing. `homepage.e2e.ts` + `prerender.e2e.ts` updated for the
new copy; the benchmark headline still matches the committed value.

`verify_all` green (typecheck ×8, `pnpm -r test`, lint, Prettier). **Site e2e (22) + prerender e2e
(7) pass.**

**Follow-ups:** wire the homepage's guides/glossary links when S15.5/S15.6 ship; apply the same
title/H1/meta pass to the remaining core pages as their content lands.

---

## S15.4 — Directory expansion + category/collection pages (pSEO)

Started/done: 2026-07-09. Grew the curated directory from **5 → 70 real, verified MCP servers**
and turned it into a categorized, indexable discovery surface targeting the "best/awesome MCP
servers" + "MCP server list/directory" cluster.

**Curation (quality over count).** Every entry's package was verified to exist on **npm or PyPI**
before listing (a scripted npm/PyPI check) — junk was dropped, including a `mcp-server-fetch`
typosquat literally self-described as a "security research canary". Descriptions are neutral
one-liners; tokens stay `${env:…}` references, never values; stdio launch via `npx`/`uvx`. Per the
product call on this story, this ships as a **curated, growing** set (70) rather than padding to 150
with unverifiable entries — reaching 150+ is a documented follow-up.

**Single source + mirror.** `packages/core/src/directory.ts` is the one source. The DB seed
`supabase/seed/directory.sql` is now **generated** from it by `directorySeedSql()`
(`pnpm --filter @mcpfold/core gen:directory-seed`); `apps/web` already re-exports core, so the app,
the marketing directory, and the DB all read the same 70 entries. A core test fails if the committed
SQL ever drifts from `DIRECTORY`.

**Collection / category pages.** New `/directory/category/<tag>` pages ("Best <category> MCP
servers"), each prerendered with **ItemList + BreadcrumbList JSON-LD**, a targeted title/H1, and
cross-links; the directory index now leads with "Best MCP servers", a browse-by-category nav, and a
`{count}+` count. Per-server pages are richer — an "How it runs" section (transport + exact launch
command) and category tags that link to their collection page.

**Thin-page / index-bloat guard.** A tag earns a page only once **`MIN_CATEGORY_ENTRIES` (3)**
distinct servers carry it. 13 categories qualify and are prerendered + in the sitemap; 6 thin tags
(finance, crm, memory, automation, monitoring, data) get no page (the route renders a not-found stub,
and they're absent from the sitemap). Documented in `directory.ts`, guarded by tests on both sides.

Tests: `packages/core/test/directory.test.ts` (5) — 60+ valid deduped entries, ref-only tokens,
every tag has a label, the thin-page guard, and the SQL-mirror no-drift check. `directory.e2e.ts`
gains category-browse + cross-link + thin-guard cases; `prerender.e2e.ts` gains a category-page
ItemList + sitemap (populated-only) check.

`verify_all` green (lint, typecheck ×8, `pnpm -r test` = 91 core + 11 e2e, `pnpm -r build`,
Prettier, docs:build). **Site e2e (24) + prerender e2e (8) pass**; 91 routes prerender (70 servers +
13 categories).

**Follow-ups:** grow the curated set toward 150+ (more verified servers per category); add
remote/`streamable-http` servers once a hosted set is curated; surface category nav in the global
site IA when S13.9 lands.

---

## S13.8 — Homepage: full narrative below the hero

Started/done: 2026-07-09. Completed the homepage body so a visitor who scrolls past the hero +
benchmark gets the whole story and converts without leaving.

- **Features overview** — the four pillars (one config for every client · curate tools/cut the
  context tax · secrets as references · sync/diff drift), each a keyword-led H2 **linking to its
  live `/docs` deep-dive**. (S13.10 will expand these into `/features` pages; today the docs deep-
  dives are the real, live targets — no dead links, matching the S15.3 "link live only" precedent.)
- **How it works** (`home/HowItWorks.tsx`) — the **init → import → sync → diff** sequence, each step
  a real CLI command with a copy-paste `CopyBlock`.
- **Use-cases teaser** (`home/UseCases.tsx` + `personas.ts`) — three persona cards (solo devs /
  teams / power users), each linking to a live surface now; `personas.ts` is the single source
  S13.11 turns into dedicated pages.
- **OSS-credibility slot** (`home/Credibility.tsx`) — MIT + the **npm version sourced from the build**
  (`__APP_VERSION__`, the committed CLI package) are baked into the **prerendered HTML**; the live
  **GitHub star count is fetched client-side and degrades gracefully** (repo link always present, no
  count/no error if the API is unavailable). No implied endorsement — factual signals only.
- **Final CTA** (`home/FinalCta.tsx`) — repeats the primary Install action + secondary team-cloud
  action.

Tests: `home.e2e.ts` gains seven cases — features deep-dive links, the four how-it-works commands +
copy buttons, persona links, credibility-from-source, the **star signal live + graceful-degrade**
(GitHub API mocked available/aborted), and the final CTA. `prerender.e2e.ts` proves the full
narrative (commands, use-cases, MIT, npm version) is in the no-JS HTML and that the client-only star
count is **not**.

`verify_all` green (lint, typecheck ×8, `pnpm -r test`, `pnpm -r build`, Prettier, docs:build).
**Site e2e (30) + prerender e2e (9) pass.**

**Follow-ups:** repoint the pillar "deep-dive" links to `/features/<slug>` when S13.10 ships and the
persona cards to `/use-cases/<id>` when S13.11 ships (both single-sourced already).

---

## S13.9 — Global navigation, header, footer, and site IA

Started/done: 2026-07-09. Replaced the flat S13.1 header/footer with a real information
architecture driven by a single source, so every page is reachable from anywhere and new pages
register in one place.

- **`site-structure.ts`** — the single source for header nav + footer link map. Each link carries a
  `status`; `planned` pages (Features S13.10, Guides S15.5) are registered but **not rendered until
  they exist**, so the nav never 404s (same "link live only" precedent as the keyword map).
  `liveInternalPaths()` exposes the registered live paths so the IA can also feed the sitemap.
- **`nav/Header.tsx`** — responsive header: desktop nav with **active-route indication**
  (`aria-current="page"`), primary **Install** CTA + secondary **Open app** link, a single
  always-visible **theme toggle**, and an accessible **mobile menu** (hamburger with
  `aria-expanded`/`aria-controls`, closes on link click and on **Escape**). Internal routes use the
  SPA `<Link>`; docs/external use real anchors.
- **`nav/Footer.tsx`** — the complete grouped link map (Product · Resources · Community · Company)
  plus the MIT license + no-endorsement note, from the same source.
- **`Layout.tsx`** — adds a **skip-to-content** link (visually hidden until focused, targets
  `<main id="main">`) ahead of the header.
- **`tokens.css`** — responsive nav (desktop row ↔ hamburger at ≤820px), skip-link, and focus
  styles.

Tests: `nav.e2e.ts` (5) — live/active/planned header, click-to-navigate active-state move, the
mobile menu (open → navigate → close on link + Escape), the footer link map resolving against the
route table with planned pages omitted, and the skip link + theme toggle. All existing suites still
green (theme-toggle is now a single instance).

`verify_all` green (lint, typecheck ×8, `pnpm -r test`, `pnpm -r build`, Prettier, docs:build).
**Site e2e (35) + prerender e2e (9) pass** — header/footer render in the prerendered HTML and hydrate
without warnings.

**Follow-ups:** flip Features/Guides to `live` in `site-structure.ts` when S13.10 / S15.5 ship (they
then appear in nav + footer automatically); wire `liveInternalPaths()` into the sitemap if non-
enumerated pages are ever added.

---

## S13.13 — Security & trust page

Started/done: 2026-07-09. Added a public `/security` trust page for security-conscious adopters —
plain-language, every claim mirrored to the authoritative docs (`docs/security.md`,
`docs/secrets.md`, `docs/threat-model.md`, `docs/security-posture.md`) and `SECURITY.md`, with the
honest caveats stated rather than glossed.

- **`security/SecurityPage.tsx`** — seven sections: refs-only secret handling (with the honest
  boundary — a value is written only via the **opt-in `inline` strategy to a gitignored target**,
  else refused, not a blanket "never touches disk"); nothing sensitive synced to the cloud (client
  guard + server ref-only guard + DB `config_is_ref_only` backstop); local-first by default;
  redacted diagnostics + telemetry **off unless `MCPFOLD_TELEMETRY=1`** (allow-listed
  non-identifying fields, `DO_NOT_TRACK` honored); supply-chain/integrity (`doctor`/`pin`/`scan`,
  plus the honest "config is executable code" caveat); machine-verified by the leak harness + CI
  gitleaks/audit; and a **responsible-disclosure** section linking `SECURITY.md` + the private
  advisory path + email. Each section deep-links its authoritative doc (all four verified to exist
  and build).
- **Wiring** — `/security` route + SEO meta + prerender + sitemap; footer "Security & trust" points
  here (single-source `site-structure.ts`); `FaqSection` gained an optional `moreLink`, used on the
  pricing FAQ to link the page.

Tests: `security.e2e.ts` (3) — the page renders the secret-handling summary (incl. the `gitignored`
caveat) and the disclosure links (`SECURITY.md` + advisory), and is reachable from both the footer
and the pricing FAQ. `nav.e2e.ts` footer-route allow-list updated for `/security`.

Accuracy: claims cross-checked against `SECURITY.md` and `docs/security.md` — the inline-strategy
nuance, the telemetry opt-in, and the config-is-executable-code caveat are stated explicitly; no
overstatement.

`verify_all` green (lint, typecheck ×8, `pnpm -r test`, `pnpm -r build`, Prettier, docs:build).
**Site e2e (38) + prerender e2e (9) pass**; 92 routes prerender.

---

## S19.2 — Adapter wave 2: bespoke formats (Goose, Codex CLI, LM Studio, Warp, opencode, Copilot CLI)

Started/done: 2026-07-09. Added six new client adapters — the matrix goes **12 → 18** — including
the first non-JSON (YAML/TOML) and first shared-config-file (merge, not clobber) adapters. Every
format was verified against current primary docs at implementation time (six parallel doc-research
passes; dates + sources recorded in `docs/coverage.md`), and none were deferred — every researched
client had a stable, documented on-disk file.

- **Shared-factory adapters** (dedicated JSON files, full replace, `mcpServers` root): **LM Studio**
  (`~/.lmstudio/mcp.json`, Cursor notation), **Warp** (`~/.warp/.mcp.json` user + project,
  file-based `.mcp.json`), **Copilot CLI** (`~/.copilot/mcp-config.json`, honors `COPILOT_HOME`,
  `includeType` so entries carry `type: stdio|http`).
- **Bespoke adapters** (merge into a file the client shares with non-MCP settings — preserve every
  unmanaged key): **Goose** (YAML `config.yaml`, `extensions` map, `cmd`/`uri`, keeps builtin
  extensions + comments), **Codex CLI** (TOML `config.toml`, `[mcp_servers.*]`, honors `CODEX_HOME`;
  preserves other tables — comments not preserved, the honest TOML limit), **opencode** (JSON `mcp`
  key, `command` **array** + `environment`, XDG path even on Windows; comment-preserving jsonc edit).
- **Framework**: `render()` gained an optional `existing?: string` so shared-config adapters merge;
  `renderWithStrategy` + `sync` thread the on-disk contents through (read BEFORE render). Dedicated-
  file adapters ignore it. New deps `yaml` + `smol-toml` live in `packages/adapters` only — **core
  purity gate stays green** (`packages/core` still parser/I-O-free). `CLIENT_IDS` 12 → 18; JSON
  schema regenerated.
- **Evidence surfaces**: compat harness made format-aware (`shapeOf`/`containerOf` parse by
  `format: json|yaml|toml`); six new compat samples captured (all 18 compatible). `docs/coverage.md`
  matrix rows + per-client verified-July-2026 notes + shared-config `‡` footnote + wave-2 roadmap;
  site "supported clients" list + FAQ (12 → 18, YAML/TOML called out); `adapter_request.yml` refreshed
  (format + shared-file + updated root-key choices).

Tests: per-adapter suites for all six (per-OS paths, render→parse round-trip; merge + idempotency for
Goose/Codex/opencode), matrix goldens (18, incl. `goose.yaml` + `codex-cli.toml`), compat format-aware
tests, `detect-clients` wave-2 coverage, and a `runSync` integration test proving a Goose fold
preserves the user's non-MCP `config.yaml` keys/comments end-to-end.

`verify_all` green (eslint + core-purity, typecheck ×10, `pnpm -r test`, `pnpm -r build`, Prettier,
docs:build). Adapters 140 / core 92 / cli 251 pass. Pre-existing, unrelated red on Windows only:
`e2e/deploy-env.test.ts` (Git-Bash mangles the `scripts/gen-cloud-env.sh` path — fails identically on
a clean tree, passes on CI ubuntu).

**Follow-ups:** S19.4 (native-interpolation secrets) can replace the `shim` default for Goose
(`env_keys`), Continue (`${{ secrets }}`), and opencode variable substitution; S19.5 (compat harness
v2) can add live evidence + a public compat matrix for the YAML/TOML clients.

---

## S19.3 — Project-scope expansion & installed-app detection

Started/done: 2026-07-09. Two audit gaps closed: (1) clients that support a project-scoped MCP
config now fold to it, and (2) `detect-clients` sees clients that are **installed but not yet
configured**, not just already-configured ones. Both parts verified against current primary docs
(two parallel research passes; sources in `docs/coverage.md`). Stacked on S19.2 (needs the 18-client
matrix).

**Project scope.** Re-verified all scope-throwing adapters against July-2026 docs:

- **Zed** and **Gemini CLI** DO support project scope → implemented (`<project>/.zed/settings.json`
  with `context_servers`; `<project>/.gemini/settings.json` with `mcpServers`). Gemini's `render`
  no longer hard-codes the user path — it honors `servers[0].scope/projectPath` like the others.
- **Claude Desktop, Windsurf, Cline** confirmed **global-only** → they (and the wave-2 user-only
  clients LM Studio / Goose / Codex CLI / Copilot CLI) now **throw** on a project/workspace profile
  instead of silently misdirecting it to the shared user file (Windsurf/Zed previously ignored scope
  entirely). The "throws on project" list shrinks by Zed + Gemini; the rest is now honest + verified.

**Installed-app detection.** New injectable `install-probes.ts` gives per-client, per-OS presence
signals — a CLI on PATH, an app bundle / install dir, a VS Code-family extension folder
(`<host>/extensions/<publisher.id>-*`), or the durable dot-dir a client writes on first run.
`detect-clients` now returns a three-way `state` (`configured` / `installed-only` / `not-found`)
plus `appPresent`, keeping the legacy `installed` field (== `configured`) so `--json` consumers are
unbroken (strictly additive). `DetectProbe` is injected, so every state is unit-tested per platform
with zero real I/O.

- `init --guided` lists installed-only clients and offers them as fold targets.
- `init` and `doctor` print "installed but not configured"; `status` adds an `installedUnconfigured`
  field + a hint line for installed clients with no profile yet.

Tests: `detect-clients.test.ts` (three states via fake probes: bin-on-PATH, extension-dir,
config-file, configured-wins-over-installed); project-scope resolve + render for Zed and Gemini CLI;
throw-on-project for the user-only clients (Goose, LM Studio); a guided test that surfaces an
installed-only client (`~/.gemini` present, no config); `status` `--json` shape updated for the
additive field.

`verify_all` green (eslint + core-purity, typecheck ×10, `pnpm -r test`, `pnpm -r build`, Prettier,
docs:build). adapters 142 / core 92 / cli 257. Same pre-existing Windows-only red as S19.2
(`e2e/deploy-env.test.ts` — Git-Bash path mangling; passes on CI ubuntu).

**Follow-ups:** the install-probe locations are a living table (like the format matrix) — refresh as
apps move; JetBrains/Visual Studio presence is detected at the family level (any JetBrains IDE / any
VS install), not per-product.

---

## S19.4 — Native-interpolation secret strategy (`native-env`)

Started/done: 2026-07-09. For a plain `${env:NAME}` ref, the `mcpfold run` shim adds a wrapper
process for nothing — many clients expand env placeholders in their own config. `native-env` writes
the client's OWN dialect instead, so the client resolves the var at launch and mcpfold stays out of
the path. The value is never written — only the placeholder name — so the leak harness stays green by
construction. Stacked on S19.3. Per-client dialects verified against primary docs (one research pass;
sources in `docs/coverage.md`/`docs/secrets.md`).

- **Capability**: adapters declare an `envInterpolation(name)` dialect; 7 clients support it (verified
  July 2026): Cursor/Windsurf `${env:NAME}`, Claude Code/Gemini/Warp/Copilot CLI `${NAME}`, opencode
  single-brace `{env:NAME}`. VS Code keeps `native-input`; Claude Desktop/Zed/JetBrains/Cline/Codex
  CLI/LM Studio/Goose(stdio) have no env interpolation → stay shim.
- **Opt-in, no silent change**: the default stays each adapter's own strategy (shim). A profile or
  server opts in via a new `secretStrategy: "shim" | "native-env"` field (server override wins over
  profile). Core `SECRET_STRATEGIES`/`STRATEGY_OVERRIDES` + `ResolvedServer.secretStrategy`;
  `resolveProfile` threads server→profile precedence; `renderWithStrategy` applies it per server.
- **Automatic shim fallback**: a native-env server with a NON-env scheme (infisical/keychain/op/
  dotenv) can't be resolved by the client, so it folds via the shim — `doctor` emits an `info`
  finding (`checkNativeEnvFallback`) explaining which server and why.
- **Round-trip**: `envRefCanonicalizer` derives each dialect's inverse from the dialect itself and
  reverses it on parse (factory adapters + the two bespoke ones), so `import`/drift reconstructs the
  canonical `${env:NAME}`.
- **Leak proof**: the S9.1 harness gains a native-env pass asserting the resolved SENTINEL value
  reaches ZERO artifacts across all 7 supporting adapters (only the placeholder name is written).

Tests: per-dialect render + round-trip (7), bearer→native Authorization header, non-env shim fallback,
per-server override, no-silent-change default, the doctor `info` finding, and the leak-harness
extension. JSON schema regenerated for the two `secretStrategy` fields.

`verify_all` green (eslint + core-purity, typecheck ×10, `pnpm -r test`, `pnpm -r build`, Prettier,
docs:build; demo unchanged). adapters 24 files / core 13 / cli 36 / security 1. Same pre-existing
Windows-only red (`e2e/deploy-env.test.ts`; passes on CI ubuntu).

**Follow-ups:** field-scoped dialects (Roo Code `${env:VAR}` in `args` only; Goose `${VAR}` in remote
headers/uri only) were conservatively left on the shim — revisit if users ask. Version-sensitivity
smoke tests (Copilot CLI `${VAR}` regressed in v0.0.407; Gemini env substitution has lagged docs)
would harden the guarantee.
