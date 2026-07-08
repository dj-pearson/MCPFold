# Deployment runbook — zero to 100% running

The single end-to-end guide for standing up the whole mcpfold stack in production: the two
Cloudflare Pages front ends, the self-hosted Supabase backend, the side Docker edge service, and
npm publishing. Each subsystem has a deeper doc (linked inline); **this page is the master index,
the environment-variable matrix, and the go-live order.**

> **Local-first stays free and needs none of this.** The CLI (`init`/`import`/`sync`/`diff`/
> `doctor`/`run`) works with no account and no server. Everything below is the optional **cloud**
> (accounts, config sync, teams) plus the public **web** surfaces.

---

## 1. Architecture at a glance

| Surface              | Host                         | Source                                                         | Purpose                                    |
| -------------------- | ---------------------------- | -------------------------------------------------------------- | ------------------------------------------ |
| Marketing site       | `mcpfold.com` (root)         | `apps/site` (Vite/React) → Cloudflare Pages `mcpfold-site`     | Landing, install, directory, docs mount    |
| Docs                 | `mcpfold.com/docs`           | `dist-docs/` static build (S8.1), mounted into the site deploy | Product docs                               |
| JSON schema          | `mcpfold.com/schema/v1.json` | `packages/schema` artifact served by the site                  | Editor autocomplete for `mcp.config.jsonc` |
| Web console          | `app.mcpfold.com`            | `apps/web` (Vite/React) → Cloudflare Pages `mcpfold-web`       | Authenticated visual editor / teams        |
| Cloud API (Supabase) | `api.mcpfold.com` → Kong     | Supabase on Coolify (one-click **or** `supabase/docker-compose.coolify.yml`) | GoTrue auth, PostgREST, Realtime           |
| Cloud API (edge)     | `functions.mcpfold.com`      | `services/edge` Docker container on Coolify                    | Device-code login, config push/pull, teams |
| Postgres             | internal (VPS)               | Supabase `db` container                                        | Append-only, RLS-guarded config store      |

```
                       ┌───────────────────────── Cloudflare ─────────────────────────┐
  browser ─────────────┤  mcpfold.com  (Pages: mcpfold-site)  + /docs + /schema        │
  CLI (npx mcpfold) ───┤  app.mcpfold.com  (Pages: mcpfold-web)                        │
                       └───────────────────────────────┬──────────────────────────────┘
                                        HTTPS           │
                    ┌───────────────────────────────────┴───────────────────────────────┐
                    │ VPS · Coolify/Traefik (TLS)                                        │
                    │  api.mcpfold.com       → Kong → GoTrue / PostgREST / Realtime      │
                    │  functions.mcpfold.com → mcpfold-edge (Deno) → device login / sync │
                    └───────────────────────────────┬───────────────────────────────────┘
                                                    │ postgres:// (shared JWT_SECRET)
                                              ┌─────┴─────┐
                                              │  Postgres │  (encrypted volume + backups)
                                              └───────────┘
```

> **Two hosts, not one.** Supabase owns `api.mcpfold.com`; the edge service runs on its own host,
> `functions.mcpfold.com`. The CLI (`MCPFOLD_API_URL`) and the web app's `VITE_API_URL` point at the
> edge host; `VITE_SUPABASE_URL` points at Kong. This avoids fragile per-path proxy routing — each
> service simply gets its own domain.

**The trust anchor is `JWT_SECRET`.** The Supabase stack, the edge container, and the JWTs the web
app's anon key is derived from must all use the **same** `JWT_SECRET`. Get this one value consistent
everywhere and auth works across every surface; get it wrong and logins fail silently.

Deeper docs: [self-hosting](self-hosting.md) · [edge service](coolify-edge-service.md) ·
[site hosting](site-hosting.md) · [at-rest hardening](security-at-rest.md) ·
[threat model](threat-model.md) · [telemetry](telemetry.md).

---

## 2. Prerequisites (accounts & tools)

| You need                              | For                                        | Notes                                                                         |
| ------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------- |
| A domain (`mcpfold.com`)              | All surfaces                               | DNS managed on Cloudflare (recommended).                                      |
| Cloudflare account                    | Pages (site + web), DNS, TLS               | Free tier is fine to start.                                                   |
| A VPS (e.g. Contabo) + Coolify        | Supabase + edge container                  | Coolify installed; Docker available.                                          |
| GitHub repo admin                     | CI/CD secrets, releases                    | For the Actions secrets in §4.                                                |
| npm account + org access to `mcpfold` | Publishing the CLI/core                    | An **automation** access token (§4).                                          |
| `openssl`, `psql`, Docker, `deno`     | Generating secrets, migrations, edge build | `psql` alone runs migrations (no Supabase CLI needed).                        |
| (Optional) GitHub OAuth app           | Browser sign-in for device-code login      | Only if you enable `GITHUB_OAUTH_*`.                                          |
| (Optional) Plausible/Umami            | Privacy-friendly analytics                 | Off unless the two `VITE_ANALYTICS_*` vars are set at build.                  |
| (Optional) Infisical                  | Central secret store                       | Anywhere below that says "Coolify env" can be an Infisical reference instead. |

---

## 3. Domains & DNS

| Record               | Points at                         | TLS                     |
| -------------------- | --------------------------------- | ----------------------- |
| `mcpfold.com` (apex) | Cloudflare Pages `mcpfold-site`   | Cloudflare              |
| `www.mcpfold.com`    | Redirect → apex (Cloudflare rule) | Cloudflare              |
| `app.mcpfold.com`       | Cloudflare Pages `mcpfold-web`    | Cloudflare              |
| `api.mcpfold.com`       | VPS IP (A/AAAA) → Coolify/Traefik | Coolify (Let's Encrypt) |
| `functions.mcpfold.com` | VPS IP (A/AAAA) → Coolify/Traefik | Coolify (Let's Encrypt) |

### Two API hosts (don't miss this)

Supabase and the edge service each get **their own host**, so there's no per-path proxy routing to
get right — Coolify assigns one domain per resource:

| Host                    | Resource                | Serves                                                        |
| ----------------------- | ----------------------- | ------------------------------------------------------------- |
| `api.mcpfold.com`       | Kong (Supabase) `:8000` | `/auth/v1` GoTrue · `/rest/v1` PostgREST · `/realtime/v1`     |
| `functions.mcpfold.com` | `mcpfold-edge` `:8000`  | `/auth-device`, `/push`, `/pull`, `/machines`, `/history`, `/revoke`, `/teams`, `/team-*`, `/health` |

The web app talks to **both**: `VITE_SUPABASE_URL=https://api.mcpfold.com` (auth/data) and
`VITE_API_URL=https://functions.mcpfold.com` (sync/teams). Its CSP `connect-src` must allow both
origins (handled in `apps/web/src/security/headers.ts`). The CLI only talks to the edge host
(`MCPFOLD_API_URL`, default `https://functions.mcpfold.com`).

> The edge router treats **any unmatched path as device-code auth**, which is exactly why it gets a
> dedicated host — you can't safely mix it with Supabase paths on one origin. (If you ever want a
> single origin instead, you'd put Kong in front and add edge routes to `kong.yml` — but the
> two-host layout above is the supported path.)

---

## 4. Environment variable matrix

Grouped by **where you set it**. Nothing secret is ever committed — every `.env.example` is a
template; real values live in the platform's settings or Infisical.

### 4a. GitHub repository secrets (CI/CD — Settings → Secrets and variables → Actions)

| Secret                  | Used by                 | Required?                      | Notes                                                                         |
| ----------------------- | ----------------------- | ------------------------------ | ----------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | `site.yml`, `pages.yml` | To deploy Pages                | Pages:Edit-scoped token. Until set, deploy steps **skip** (build still runs). |
| `CLOUDFLARE_ACCOUNT_ID` | `site.yml`, `pages.yml` | To deploy Pages                | Cloudflare account id.                                                        |
| `NPM_TOKEN`             | `release.yml`           | To publish to npm              | npm **automation** token; also used as `NODE_AUTH_TOKEN`. Provenance is on.   |
| `GITHUB_TOKEN`          | multiple                | Auto-provided                  | No action needed.                                                             |
| `HOMEBREW_TAP_TOKEN`    | `release.yml` (future)  | For `brew`/`scoop` auto-update | Only once you create `dj-pearson/homebrew-tap` + `scoop-bucket` repos.        |

### 4b. Cloudflare Pages — `mcpfold-site` (build-time env, Pages project → Settings → Env vars)

Build command `pnpm --filter @mcpfold/site build`; output `apps/site/dist`.

| Var                     | Required? | Value / notes                                                                                 |
| ----------------------- | --------- | --------------------------------------------------------------------------------------------- |
| `VITE_ANALYTICS_SRC`    | Optional  | e.g. `https://plausible.io/js/script.js`. Analytics load **only** if this + the next are set. |
| `VITE_ANALYTICS_DOMAIN` | Optional  | e.g. `mcpfold.com`.                                                                           |

> The site version badge (`__APP_VERSION__`) is injected from `packages/cli/package.json` at build —
> **not** an env var. CI already builds the docs and mounts them at `/docs`; if you build Pages
> directly from the dashboard, replicate the `pnpm docs:build` → copy-to-`dist/docs` step, or keep
> deploys on the `site.yml` workflow (recommended).

### 4c. Cloudflare Pages — `mcpfold-web` (build-time env)

Build command `pnpm --filter "@mcpfold/web..." build`; output `apps/web/dist`. See `apps/web/.env.example`.

| Var                      | Required?         | Value / notes                                                                                           |
| ------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`      | **Yes**           | `https://api.mcpfold.com` (the Kong origin).                                                            |
| `VITE_SUPABASE_ANON_KEY` | **Yes**           | The Supabase **ANON_KEY** JWT (public; RLS enforces access). Must be signed with the prod `JWT_SECRET`. |
| `VITE_API_URL`           | **Yes**           | `https://functions.mcpfold.com` (the edge host). Defaults to it if unset; keep it explicit.            |
| `VITE_E2E`               | **Never in prod** | `1` only in test builds — swaps in mock auth/api.                                                       |

### 4d. Supabase stack (Coolify env for `docker-compose.coolify.yml`) — see `supabase/.env.example`

| Var                                              | Required?            | How to get it                                                                                                                                                |
| ------------------------------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POSTGRES_DB`                                    | Yes                  | `postgres` (default).                                                                                                                                        |
| `POSTGRES_PASSWORD`                              | **Yes (secret)**     | `openssl rand -hex 24`.                                                                                                                                      |
| `JWT_SECRET`                                     | **Yes (secret)**     | `openssl rand -hex 32` (≥32 chars). **Same value in the edge service.**                                                                                      |
| `JWT_EXPIRY`                                     | Yes                  | `3600`.                                                                                                                                                      |
| `ANON_KEY`                                       | **Yes (secret-ish)** | JWT signed with `JWT_SECRET`; mint via the [Supabase key generator](https://supabase.com/docs/guides/self-hosting#api-keys). Feeds `VITE_SUPABASE_ANON_KEY`. |
| `SERVICE_ROLE_KEY`                               | **Yes (secret)**     | JWT signed with `JWT_SECRET`; server-side only, never shipped to a browser.                                                                                  |
| `API_EXTERNAL_URL`                               | Yes                  | `https://api.mcpfold.com`.                                                                                                                                   |
| `SITE_URL`                                       | Yes                  | `https://mcpfold.com`.                                                                                                                                       |
| `ADDITIONAL_REDIRECT_URLS`                       | Yes                  | `https://mcpfold.com/auth/callback` (add `https://app.mcpfold.com/...` if the console uses OAuth callbacks).                                                 |
| `REALTIME_ENC_KEY`                               | Yes (secret)         | `openssl rand -hex 16` (32 hex chars).                                                                                                                       |
| `REALTIME_SECRET_KEY_BASE`                       | Yes (secret)         | `openssl rand -hex 32` (64 hex chars).                                                                                                                       |
| `GITHUB_OAUTH_ENABLED`                           | Optional             | `true` to allow GitHub browser sign-in for device-code login.                                                                                                |
| `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_SECRET` | If OAuth on          | From your GitHub OAuth app; callback `https://api.mcpfold.com/auth/v1/callback`.                                                                             |
| `DISABLE_SIGNUP`                                 | Optional             | `false` (default) or `true` to lock signups.                                                                                                                 |

### 4e. Side edge service (Coolify env for `services/edge`) — see its `README.md`

| Var            | Required?        | Notes                                                                                                                               |
| -------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL` | **Yes (secret)** | `postgres://postgres:<PW>@<db-host>:5432/postgres`. Use the **internal** Docker host. With Coolify one-click Supabase, `<db-host>` is the DB container name (`docker ps \| grep supabase-db`); the edge must share that network (both usually on the `coolify` network). `<PW>` = the Supabase `POSTGRES_PASSWORD`/`SERVICE_PASSWORD`. |
| `JWT_SECRET`   | **Yes (secret)** | **Identical** to the Supabase `JWT_SECRET` (one-click surfaces it as `SERVICE_SUPABASEJWT`) — this is what makes tokens interoperate. Re-sync it whenever you rebuild Supabase. |
| `SITE_URL`     | Yes              | `https://mcpfold.com` (base for device-code verification URLs).                                                                     |
| `JWT_EXPIRY`   | Optional         | Access-token lifetime, seconds (default `3600`).                                                                                    |
| `PORT`         | Optional         | Default `8000`.                                                                                                                     |

---

## 5. Go-live order

Do these in sequence — later steps depend on earlier ones.

### Step 1 — Domain & DNS

Add `mcpfold.com` to Cloudflare, point nameservers, create the records in §3. Leave `api.` for after
the VPS is up.

### Step 2 — Supabase on Coolify · [self-hosting.md](self-hosting.md)

1. Generate all secrets (§4d commands). Store them in Coolify env (or Infisical).
2. Stand up Supabase on Coolify, either:
   - **Coolify one-click Supabase** (simplest; what mcpfold.com runs) — note it generates its own
     `JWT_SECRET`/keys, which the edge must then match (§4e), and includes extra services (Studio,
     Storage, Analytics/Logflare). The Analytics container is the usual failure point — if the stack
     won't start, check its logs first (commonly a Postgres password mismatch after a rebuild), or
   - **`supabase/docker-compose.coolify.yml`** (this repo's minimal stack: db/auth/rest/realtime/
     kong) → set every §4d var; confirm image tags against the current [`supabase/docker`](https://github.com/supabase/supabase/tree/master/docker) set.
3. Point `api.mcpfold.com` at the Kong gateway (`:8000`); let Coolify terminate TLS + HSTS.
4. Deploy → brings up Postgres, GoTrue, PostgREST, Realtime.
5. **Apply migrations** against the running DB:
   ```bash
   DATABASE_URL='postgres://postgres:PASSWORD@api.mcpfold.com:5432/postgres' \
     supabase/scripts/migrate.sh
   ```
   (Seed the public directory for the site: `supabase/seed/directory.sql` mirrors `packages/core`.)

### Step 3 — Side edge service on Coolify · [coolify-edge-service.md](coolify-edge-service.md)

1. Coolify → new **Dockerfile** application → **Base Directory `/services/edge`**, Dockerfile
   `/Dockerfile` (the `COPY` paths are relative to `services/edge`, so the build context must be
   that folder).
2. Set §4e env (same `JWT_SECRET` as Supabase; `DATABASE_URL` to the Supabase Postgres via the
   internal Docker network — see §4e for the one-click container-name detail).
3. Assign the domain **`functions.mcpfold.com`** and expose `:8000`; Coolify/Traefik terminates TLS.
   No per-path routing — the edge owns this host outright.
4. Deploy; Coolify uses the image `HEALTHCHECK` (`/health`) for zero-downtime rollouts.

> `/health` does **not** touch Postgres, so a green healthcheck ≠ working DB. Confirm the DB path
> with `POST /auth-device/start` (§6), which writes a row.

### Step 4 — At-rest hardening · [security-at-rest.md](security-at-rest.md)

Before real traffic: LUKS-encrypt the Postgres volume, set up encrypted + restore-tested backups
(`supabase/backup/`), enforce TLS/HSTS. Confirm with `supabase/verify-hardening.sh`.

### Step 5 — Marketing site (Cloudflare Pages `mcpfold-site`) · [site-hosting.md](site-hosting.md)

1. Set `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` GitHub secrets (§4a).
2. Create the `mcpfold-site` Pages project (name matters — the workflow deploys by name).
3. Set §4b analytics vars if using analytics.
4. Push to `main` → `site.yml` builds, runs Playwright + the Lighthouse budget, deploys prod (and a
   preview per PR). Docs mount at `/docs`.
5. **Docs cutover:** docs currently deploy to GitHub Pages (S8.1); moving them under
   `mcpfold.com/docs` is a one-time CNAME/target move (noted in site-hosting.md).

### Step 6 — Web console (Cloudflare Pages `mcpfold-web`)

1. Create the `mcpfold-web` Pages project.
2. Set §4c build env: `VITE_SUPABASE_URL=https://api.mcpfold.com`, `VITE_SUPABASE_ANON_KEY`, and
   `VITE_API_URL=https://functions.mcpfold.com` (the edge host). **Never** set `VITE_E2E` in prod.
3. Point `app.mcpfold.com` at the project. `pages.yml` builds on every push and deploys when the
   Cloudflare secrets exist.

### Step 7 — npm publishing · [release.yml](../.github/workflows/release.yml)

1. Add `NPM_TOKEN` (automation token) as a GitHub secret.
2. Merges to `main` with a changeset open a **"Version Packages"** PR; merging that PR publishes
   `@mcpfold/*` + `mcpfold` to npm with provenance. No manual `npm publish`.
3. Standalone binaries attach on a published GitHub Release; Homebrew/Scoop auto-bump needs
   `HOMEBREW_TAP_TOKEN` + the tap/bucket repos (§4a).

### Step 8 — Optional: GitHub OAuth for browser sign-in

Create a GitHub OAuth app, set `GITHUB_OAUTH_*` + `GITHUB_OAUTH_ENABLED=true` in the Supabase env
(§4d), callback `https://api.mcpfold.com/auth/v1/callback`, redeploy the auth service.

---

## 6. Verification / smoke per surface

| Surface        | Check                                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------------- |
| Supabase       | `curl https://api.mcpfold.com/rest/v1/` returns PostgREST; migrations table `public.schema_migrations` populated.     |
| RLS invariants | `supabase/scripts/test-rls.sh` against the DB passes (tenant isolation, append-only, refs-only).                      |
| Edge service   | `curl https://functions.mcpfold.com/health` → `{ "ok": true, "service": "mcpfold-edge" }`.                            |
| Edge ↔ DB      | `curl -X POST https://functions.mcpfold.com/auth-device/start -H 'content-type: application/json' -d '{"machine_name":"test"}'` returns a device code (proves the Postgres write path — `/health` alone doesn't). |
| Edge contract  | Unauthenticated `POST /push` → 401; an authed `push`→`pull` round-trips (`services/edge/scripts/container-smoke.sh`). |
| CLI ↔ cloud    | `mcpfold login` completes the device-code flow; `mcpfold push` / `pull` sync a ref-only config.                       |
| Marketing site | `mcpfold.com` loads; `/docs` resolves; `/schema/v1.json` served; OG tags present; Lighthouse budget green.            |
| Web console    | `app.mcpfold.com` signs in against Supabase; a cross-tenant read is denied.                                           |
| npm            | `release.yml` dry-run + `pack-smoke` green; after a real release, `npx mcpfold@latest --version` matches.             |

---

## 7. Ongoing operations

- **Secret rotation.** Rotating `JWT_SECRET` invalidates all sessions and **must** be done in both
  the Supabase env and the edge env together, plus re-mint `ANON_KEY`/`SERVICE_ROLE_KEY` and update
  `VITE_SUPABASE_ANON_KEY`. Treat as a coordinated change.
- **Backups.** Encrypted, restore-tested backups live in `supabase/backup/`; verify restores
  periodically, not just that backups run.
- **Image tags.** Supabase image tags in the compose file are a known-good baseline — re-pin to the
  current `supabase/docker` set on each intentional upgrade; don't float `latest`.
- **Adapter/client drift.** `adapter-compat.yml` flags when a client changes its on-disk format
  upstream (S14.2) — watch for the auto-opened issue.
- **Telemetry.** CLI adoption telemetry is opt-in and redaction-safe — see [telemetry.md](telemetry.md).
- **Updates.** Cloudflare Pages redeploys on push; Coolify redeploys the Supabase/edge resources on
  new commits or manual trigger (health-checked, zero-downtime).

---

## 8. Things people commonly miss (pre-launch checklist)

- [ ] `JWT_SECRET` is **byte-identical** in Supabase env and edge env, and `ANON_KEY` was minted from it. (Re-sync both after any Supabase rebuild — a fresh stack mints a new secret.)
- [ ] `api.mcpfold.com` serves **Kong** and `functions.mcpfold.com` serves the **edge** (§3) — hit one from each.
- [ ] Edge actually reaches Postgres — `POST /auth-device/start` returns a device code, not a 500 (a green `/health` doesn't prove this).
- [ ] `VITE_SUPABASE_ANON_KEY` set on the `mcpfold-web` Pages project (build-time — a missing value
      only shows up as broken auth at runtime, not a build failure).
- [ ] `VITE_E2E` is **not** set on any production Pages project.
- [ ] Cloudflare Pages **project names** are exactly `mcpfold-site` / `mcpfold-web` (workflows deploy by name).
- [ ] `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` set, or deploys silently skip.
- [ ] Migrations applied to the **production** DB, not just CI (`migrate.sh` against the live URL).
- [ ] Public directory seeded (`supabase/seed/directory.sql`) if the app's directory reads from the DB.
- [ ] At-rest hardening done and `verify-hardening.sh` passes **before** real traffic.
- [ ] `ADDITIONAL_REDIRECT_URLS` / OAuth callback include every host that initiates sign-in.
- [ ] Docs `/docs` cutover from GitHub Pages to Cloudflare completed (or the Cloudflare route fronts both).
- [ ] `NPM_TOKEN` is an **automation** token (survives 2FA in CI); provenance requires `id-token: write` (already set).
- [ ] TLS/HSTS terminates at Coolify for `api.`; Cloudflare handles TLS for the Pages hosts.
- [ ] Analytics vars set only if you want analytics — otherwise the site correctly stays silent.
