# Deployment guide — from zero to fully running

This is a **step-by-step walkthrough** for standing up the entire mcpfold cloud, start to finish.
Follow it top to bottom; each step ends with a check so you know it worked before moving on. No prior
knowledge of the stack is assumed.

> **You do not need any of this to use mcpfold.** The CLI (`init` / `import` / `sync` / `diff` /
> `doctor` / `run`) is free, local-only, and needs no account or server. This guide is only for
> running the optional **cloud** (accounts, config sync, teams), the **public website**, and
> publishing the CLI to npm / Homebrew / Scoop.

If you get stuck, jump to [Troubleshooting](#troubleshooting) at the bottom — the common failures and
their fixes are listed there.

---

## The big picture (read this once)

You're going to deploy **five pieces** across **four web addresses**:

| # | Piece | Lives at | What it is |
| - | ----- | -------- | ---------- |
| 1 | Marketing site | `mcpfold.com` | The public website + docs (Cloudflare Pages) |
| 2 | Web console | `app.mcpfold.com` | The logged-in dashboard (Cloudflare Pages) |
| 3 | Supabase | `api.mcpfold.com` | Auth + database gateway (Docker, on your server via Coolify) |
| 4 | Edge service | `functions.mcpfold.com` | mcpfold's sync/login API (Docker, on your server via Coolify) |
| 5 | Postgres | *(internal, not public)* | The database, inside Supabase |

```
   Browser / CLI
        │  HTTPS
        ▼
  ┌───────────────────────── Cloudflare ─────────────────────────┐
  │  mcpfold.com          → marketing site + /docs                │
  │  app.mcpfold.com      → web console                           │
  └───────────────────────────────────────────────────────────────┘
        │  HTTPS
        ▼
  ┌───────── Your server (VPS) running Coolify ──────────┐
  │  api.mcpfold.com        → Supabase (auth + database) │
  │  functions.mcpfold.com  → edge service (sync/login)  │
  │                    │                                  │
  │                    ▼   both talk to                   │
  │              Postgres (inside Supabase)               │
  └───────────────────────────────────────────────────────┘
```

**The one rule that matters most:** a secret called `JWT_SECRET` must be the **exact same value** in
Supabase *and* in the edge service. It's the shared key that lets logins work across both. Get it
identical and everything authenticates; get it wrong and logins fail with confusing errors. We'll
generate it once and paste the same value in both places.

Deeper reference docs (optional): [self-hosting](self-hosting.md) ·
[edge service](coolify-edge-service.md) · [site hosting](site-hosting.md) ·
[at-rest hardening](security-at-rest.md) · [threat model](threat-model.md).

---

## Before you start: accounts & tools

**Accounts you'll need** (all have free tiers to start):

- A **domain** — `mcpfold.com` in these examples. DNS managed on **Cloudflare** (recommended).
- A **Cloudflare** account — hosts the two websites, DNS, and TLS.
- A **VPS** (e.g. Contabo, Hetzner) with **[Coolify](https://coolify.io)** installed — runs the
  Supabase + edge Docker containers.
- **Admin access to the GitHub repo** — for CI secrets and releases.
- An **npm account** with publish rights to the `mcpfold` name — for the CLI.
- *(Optional)* a **GitHub OAuth app** — only if you want "Sign in with GitHub."

**Tools on your local machine.** Commands in this guide are written for **PowerShell** on Windows.
Run these checks; install anything that's missing:

```powershell
git --version        # any recent
node --version       # v20 or newer
corepack enable      # turns on pnpm (ships with Node)
pnpm --version       # v10 or newer
openssl version      # any — used to generate secrets
psql --version       # PostgreSQL client — used to run DB migrations
docker --version     # to build/run containers locally if needed
```

> A couple of steps run the repo's `.sh` helper scripts (they're written in bash). On Windows those
> run through **Git Bash**, which installs with Git for Windows — you invoke them from PowerShell with
> `bash <script>`, shown below. Everything else is native PowerShell.

Clone the repo and install dependencies once:

```powershell
git clone https://github.com/dj-pearson/MCPFold.git
cd MCPFold
pnpm install
```

✅ **Check:** `pnpm --version` prints 10.x and `pnpm install` finished without errors.

---

## Step 1 — Generate all your secrets

The cloud needs several random secrets and two special login keys. Instead of making them by hand,
run the generator — it creates everything and prints ready-to-paste blocks for each surface. It's a
bash script, so invoke it through Git Bash (the `>` redirect is native PowerShell):

```powershell
bash scripts/gen-cloud-env.sh > cloud.env
```

Open `cloud.env` in an editor. You'll see labeled blocks:

- **Supabase stack** — `POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, etc.
- **Side edge service** — `DATABASE_URL`, the same `JWT_SECRET`, etc.
- **Web console** — `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`.

Keep this file somewhere safe (a password manager). **Do not commit it** — `cloud.env` /
`*.env` are gitignored on purpose. You'll copy values out of it in the steps below.

> **Why the same `JWT_SECRET` appears twice:** the generator deliberately reuses one `JWT_SECRET`
> across the Supabase block and the edge block. That's the shared trust anchor from the big-picture
> section. Don't "fix" it by making them different.

✅ **Check:** `cloud.env` exists and the `JWT_SECRET=` line is identical in both the Supabase and edge
blocks.

---

## Step 2 — Point your domains at the right place (DNS)

In Cloudflare's DNS settings for `mcpfold.com`, create these records. (You can add `api.` and
`functions.` now even though the server isn't ready yet.)

| Record | Type | Points at | TLS handled by |
| ------ | ---- | --------- | -------------- |
| `mcpfold.com` (apex) | Pages | Cloudflare Pages project `mcpfold-site` | Cloudflare |
| `www.mcpfold.com` | Redirect | → `mcpfold.com` (a Cloudflare redirect rule) | Cloudflare |
| `app.mcpfold.com` | Pages | Cloudflare Pages project `mcpfold-web` | Cloudflare |
| `api.mcpfold.com` | A / AAAA | your VPS IP address | Coolify (Let's Encrypt) |
| `functions.mcpfold.com` | A / AAAA | your VPS IP address | Coolify (Let's Encrypt) |

Note: `api.` and `functions.` both point at the **same server IP** — Coolify tells them apart by
hostname and gives each its own HTTPS certificate.

✅ **Check:** both resolve to your VPS IP (may take a few minutes to propagate):

```powershell
Resolve-DnsName api.mcpfold.com -Type A
Resolve-DnsName functions.mcpfold.com -Type A
```

---

## Step 3 — Deploy Supabase (auth + database) on Coolify

Supabase is a bundle of services (Postgres, GoTrue for auth, PostgREST for data, a Kong gateway).
The easiest path is Coolify's built-in one-click Supabase.

1. In Coolify: **+ New → Service → Supabase**.
2. In the service's **Environment Variables**, set the values from the **Supabase block** of your
   `cloud.env` (`POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `API_EXTERNAL_URL`,
   `SITE_URL`, the two `REALTIME_*` keys, etc.).
3. Set the service's **domain** to `https://api.mcpfold.com` and let Coolify handle TLS.
4. **Deploy.**

> ⚠️ **The #1 thing that goes wrong here:** Supabase's `analytics` (Logflare) container fails and
> takes the whole stack down with it. If the deploy hangs or errors on `supabase-analytics`, see
> [Troubleshooting → Supabase won't start](#supabase-wont-start-analytics-unhealthy). It's almost
> always a leftover-password mismatch, fixable without losing data.
>
> **If you ever rebuild Supabase from scratch, it generates NEW keys.** You must then re-copy the new
> `JWT_SECRET` / `ANON_KEY` into the edge service and web console (Steps 5 and 7).

✅ **Check:** `curl.exe https://api.mcpfold.com/rest/v1/` returns a small JSON response from PostgREST
(not a connection error).

---

## Step 4 — Set up the database tables (migrations)

Supabase gives you an empty database; mcpfold's tables + security rules live in `supabase/migrations/`.
Apply them with the migrate script (bash script → run via Git Bash), pointing it at your live
database. In PowerShell you set the variable first, then run it:

```powershell
$env:DATABASE_URL = "postgres://postgres:YOUR_POSTGRES_PASSWORD@YOUR_DB_HOST:5432/postgres"
bash supabase/scripts/migrate.sh
```

- `YOUR_POSTGRES_PASSWORD` — from `cloud.env`.
- `YOUR_DB_HOST` — how you reach Postgres from your machine. With one-click Supabase the DB isn't
  public, so the simplest option is to run this **from the server** using the DB container name, or
  paste the SQL via the Supabase Studio SQL editor. (Studio is included in the one-click stack.)

To also load the public server directory the website shows:

```powershell
$env:SEED = "1"
bash supabase/scripts/migrate.sh
```

✅ **Check:** you should see mcpfold's tables and a `schema_migrations` ledger:

```powershell
psql $env:DATABASE_URL -c '\dt public.*'
```

---

## Step 5 — Deploy the edge service on Coolify

The edge service is mcpfold's own small API (device-code login, config push/pull, teams). It runs as
its own container and gets its **own** host, `functions.mcpfold.com`.

1. In Coolify: **+ New → Application → Public Repository**, URL `https://github.com/dj-pearson/MCPFold`.
2. Build settings:
   - **Build Pack:** Dockerfile
   - **Base Directory:** `/services/edge`  ← important; the Dockerfile's file paths are relative to
     this folder, so the build context must be it (not the repo root).
   - **Dockerfile Location:** `/Dockerfile`
   - **Port:** `8000`
3. **Environment Variables** — from the **edge block** of `cloud.env`, but adjust two for one-click
   Supabase:
   - `JWT_SECRET` — must **exactly match** Supabase's `JWT_SECRET`. (One-click Supabase shows it as
     `SERVICE_SUPABASEJWT` in its env — copy that value here.)
   - `DATABASE_URL` — `postgres://postgres:PASSWORD@DB_CONTAINER:5432/postgres`, where `DB_CONTAINER`
     is the Supabase Postgres container name. Find it on the server with
     `docker ps | grep supabase-db` (e.g. `supabase-db-xxxxxxxx`). The edge container must be on the
     same Docker network as that container — both are usually on Coolify's shared `coolify` network.
   - `SITE_URL` — `https://mcpfold.com`.
4. Set the **domain** to `https://functions.mcpfold.com`, expose port `8000`, let Coolify handle TLS.
5. **Deploy.** Coolify uses the image's health check (`/health`) for zero-downtime restarts.

✅ **Check 1 (service is up):**
```powershell
curl.exe https://functions.mcpfold.com/health
# → {"ok":true,"service":"mcpfold-edge"}
```

✅ **Check 2 (it can actually reach the database — this is the important one):**
```powershell
curl.exe -X POST https://functions.mcpfold.com/auth-device/start -H "content-type: application/json" -d '{\"machine_name\":\"test\"}'
# → a JSON device code
```
> Use `curl.exe` (not `curl`) — in PowerShell plain `curl` is an alias for `Invoke-WebRequest` with
> different syntax. Keep it on **one line**; PowerShell doesn't use `\` for line continuation.

`/health` passing does **not** prove the database works — it doesn't touch Postgres. The
`/auth-device/start` call writes a row, so a device code back means the `DATABASE_URL` and network are
correct. A `500` here means the DB connection is wrong — see
[Troubleshooting → Edge can't reach the database](#edge-cant-reach-the-database).

---

## Step 6 — Deploy the marketing site (Cloudflare Pages)

1. In Cloudflare: **Workers & Pages → Create → Pages → Connect to Git**, pick the `MCPFold` repo.
2. Build settings:
   - **Build command:** `npm run build:site:docs`
   - **Build output directory:** `apps/site/dist`
   - **Root directory:** leave as the repo root
3. **Project name must be exactly `mcpfold-site`** (the GitHub Actions workflow deploys by that name).
4. *(Optional)* set `VITE_ANALYTICS_SRC` + `VITE_ANALYTICS_DOMAIN` if you use privacy-friendly
   analytics. The site needs **no secrets** otherwise.
5. Deploy, then set the custom domain to `mcpfold.com`.

✅ **Check:** `mcpfold.com` loads, `mcpfold.com/docs` resolves, and `mcpfold.com/schema/v1.json` is
served.

---

## Step 7 — Deploy the web console (Cloudflare Pages)

1. Cloudflare **→ Create → Pages → Connect to Git**, same repo, a **second** project.
2. Build settings:
   - **Build command:** `npm run build:web`
   - **Build output directory:** `apps/web/dist`
3. **Project name must be exactly `mcpfold-web`.**
4. **Environment Variables** — from the **web block** of `cloud.env`:
   - `VITE_SUPABASE_URL` = `https://api.mcpfold.com`
   - `VITE_SUPABASE_ANON_KEY` = the `ANON_KEY` from `cloud.env`
   - `VITE_API_URL` = `https://functions.mcpfold.com`
   - ⚠️ **Never** set `VITE_E2E` in production (it swaps in fake auth).
5. Deploy, then set the custom domain to `app.mcpfold.com`.

✅ **Check:** `app.mcpfold.com` loads and you can sign in. If sign-in fails, the usual cause is a
`JWT_SECRET`/`ANON_KEY` mismatch — see
[Troubleshooting → Web login fails](#web-login-fails).

---

## Step 8 — Publish the CLI to npm

Publishing is automated with [Changesets](https://github.com/changesets/changesets) — you don't run
`npm publish` by hand.

**One-time setup:**

1. Create an **automation** access token at npmjs.com (Account → Access Tokens → Generate → *Automation*).
   An automation token works in CI without 2FA prompts.
2. In the GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**, name it
   `NPM_TOKEN`, paste the token.

**Cutting a release (every time):**

1. When you make a user-facing change, add a changeset describing it:
   ```bash
   pnpm changeset
   ```
   Pick the packages and the bump level (patch/minor/major); commit the generated file.
2. Merge that to `main`. The `release.yml` workflow opens a **"Version Packages"** pull request that
   bumps versions and updates changelogs.
3. **Merge the "Version Packages" PR.** That merge publishes `mcpfold` + `@mcpfold/*` to npm with
   provenance — automatically.

✅ **Check:** after the release PR merges, `npx mcpfold@latest --version` prints the new version.

---

## Step 9 — Standalone binaries, Homebrew & Scoop

Some users install without npm — a raw binary, `brew install`, or `scoop install`. These all download
from the binaries attached to a **GitHub Release**.

**Binaries (automatic):** when you publish a GitHub Release, the `binaries` job in `release.yml`
cross-compiles a native `mcpfold` binary for each OS/arch, checksums them, and attaches them to the
release. Nothing for you to do beyond creating the Release.

**Homebrew & Scoop (automatic once set up):** the release pipeline already has a `packaging` job that,
on each release, renders the concrete formula/manifest (real version + download URLs + SHA-256 from
the release binaries) and pushes them to your tap/bucket repos. You only do the **one-time setup**:

1. Create two public GitHub repos under your account:
   - `dj-pearson/homebrew-tap` — the pipeline writes `Formula/mcpfold.rb` here.
   - `dj-pearson/scoop-bucket` — the pipeline writes `bucket/mcpfold.json` here.
   - (Empty repos are fine — the job creates the files. No manual seeding needed.)
2. Create a **PAT with write (contents) access to both repos** and add it as the repo secret
   **`HOMEBREW_TAP_TOKEN`**. Until it's set, the `packaging` job renders the manifests but **skips the
   push** (it won't fail the release).
3. Re-run the release (or cut the next one). The job pushes `mcpfold.rb` / `mcpfold.json` with that
   release's version and checksums.

After that, `brew install dj-pearson/tap/mcpfold` and `scoop install mcpfold` track every release.
Version parity is kept green automatically: `scripts/sync-packaging-version.mjs` runs during the
"Version Packages" step to bump the template versions, and `pnpm check:version-parity` (CI) enforces
that npm, Homebrew, and Scoop all agree.

✅ **Check:** `brew install dj-pearson/tap/mcpfold && mcpfold --version` works on macOS;
`scoop install mcpfold` works on Windows.

---

## Step 10 — Lock it down before real traffic (at-rest hardening)

Before you let real users in, harden the server (details in
[security-at-rest.md](security-at-rest.md)):

- Encrypt the Postgres data volume (LUKS).
- Set up **encrypted, restore-tested** backups (`supabase/backup/`) — verify a restore actually
  works, not just that backups run.
- Enforce TLS + HSTS (Coolify terminates TLS for `api.` and `functions.`).
- Run `supabase/verify-hardening.sh` and confirm it passes.

---

## Optional — "Sign in with GitHub"

If you want browser sign-in via GitHub for device-code login:

1. Create a **GitHub OAuth app**; callback URL `https://api.mcpfold.com/auth/v1/callback`.
2. In the Supabase env set `GITHUB_OAUTH_ENABLED=true`, `GITHUB_OAUTH_CLIENT_ID`,
   `GITHUB_OAUTH_SECRET`, and add the callback to `ADDITIONAL_REDIRECT_URLS`.
3. Redeploy the auth service.

---

## Final pre-launch checklist

- [ ] `JWT_SECRET` is **byte-identical** in Supabase and the edge service; `ANON_KEY` was minted from
      that same secret. (Re-sync both after any Supabase rebuild.)
- [ ] `api.mcpfold.com` serves Supabase and `functions.mcpfold.com` serves the edge — test one call
      to each.
- [ ] Edge → database proven: `POST /auth-device/start` returns a device code (a green `/health` is
      **not** enough).
- [ ] `VITE_SUPABASE_ANON_KEY` and `VITE_API_URL` are set on the `mcpfold-web` Pages project (missing
      values only surface as broken auth at runtime, not as a build failure).
- [ ] `VITE_E2E` is **not** set on any production Pages project.
- [ ] Pages project names are exactly `mcpfold-site` and `mcpfold-web`.
- [ ] `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` + `NPM_TOKEN` are set as GitHub secrets.
- [ ] Migrations applied to the **production** database (not just locally/CI).
- [ ] At-rest hardening done and `verify-hardening.sh` passes.
- [ ] `ADDITIONAL_REDIRECT_URLS` / OAuth callbacks include every host that starts a sign-in.

---

## Ongoing operations

- **Rotating `JWT_SECRET`** logs everyone out and must be changed in **both** Supabase and the edge
  service together, then re-mint `ANON_KEY`/`SERVICE_ROLE_KEY` and update `VITE_SUPABASE_ANON_KEY`.
  Treat it as one coordinated change (re-run `scripts/gen-cloud-env.sh` to get a fresh consistent set).
- **Backups** — verify restores periodically, not just that backups run.
- **Supabase image tags** — re-pin to a current known-good set on each intentional upgrade; don't
  float `latest`.
- **Deploys** — Cloudflare Pages redeploy on push; Coolify redeploys Supabase/edge on new commits or
  a manual trigger (health-checked, zero-downtime).

---

## Troubleshooting

> The `docker …` commands below run **on your server** — in an SSH session or Coolify's built-in
> terminal — where the shell is Linux/bash, so `grep` and `--tail` work as written. Everything you run
> from your own machine stays PowerShell.

### Supabase won't start (analytics unhealthy)

Symptom: the deploy log ends with `dependency failed to start: container supabase-analytics-… is
unhealthy`, and Kong/auth/rest never come up.

Cause: the `analytics` (Logflare) container can't authenticate to Postgres — almost always because the
DB volume was first created with a **different** password than what's now in the env (common after
changing `POSTGRES_PASSWORD` or a half-finished first boot).

Fix:
1. Read the real error: `docker logs supabase-analytics-<id> --tail 80`.
2. If it says `password authentication failed`, set `POSTGRES_PASSWORD` back to what the volume was
   created with — **or**, if there's no important data yet, reset the DB volume and redeploy so it
   re-initializes cleanly (⚠️ destructive — wipes the database).
3. To get the rest of the stack up while you sort analytics, you can disable the `analytics` service
   (it's just internal logging) and drop the `depends_on: analytics` conditions.

### Edge can't reach the database

Symptom: `curl.exe https://functions.mcpfold.com/health` is fine, but `POST /auth-device/start` returns a
`500`.

Fix — read the edge logs: `docker logs <edge-container> --tail 40`:
- `ECONNREFUSED` / `getaddrinfo` → wrong host or the edge isn't on the same Docker network as
  Postgres. Use the DB **container name** (`docker ps | grep supabase-db`) as the host and make sure
  both containers share the `coolify` network.
- `password authentication failed` → the password in `DATABASE_URL` is wrong (re-copy from the
  Supabase env; remember it changes on a rebuild).

### `api.mcpfold.com` returns `{"message":"Unauthorized",...}` or a Supabase 404

That response is **Supabase's Kong**, not the edge. It means you're calling an edge path
(`/auth-device`, `/push`, …) on the Supabase host. Edge paths live on **`functions.mcpfold.com`** in
this two-host setup — call them there. `api.mcpfold.com` is only for Supabase's own paths
(`/auth/v1`, `/rest/v1`, `/realtime/v1`).

### Web login fails

Almost always a key mismatch:
- `VITE_SUPABASE_ANON_KEY` must be an `ANON_KEY` minted from the **current** Supabase `JWT_SECRET`. If
  you rebuilt Supabase, the old key is invalid — copy the new one and redeploy the web project.
- The edge service's `JWT_SECRET` must match Supabase's, or tokens minted by one are rejected by the
  other.

### CLI can't reach the cloud

The CLI defaults to `https://functions.mcpfold.com`. To test against a different endpoint (or before a
release ships the new default), override it:
```powershell
$env:MCPFOLD_API_URL = "https://functions.mcpfold.com"
```

---

## Verification cheat-sheet

| Surface | Quick check |
| ------- | ----------- |
| Supabase | `curl.exe https://api.mcpfold.com/rest/v1/` → PostgREST JSON |
| Database | `psql $env:DATABASE_URL -c '\dt public.*'` shows tables + `schema_migrations` |
| Edge (up) | `curl.exe https://functions.mcpfold.com/health` → `{"ok":true,...}` |
| Edge (DB) | `POST /auth-device/start` → a device code (proves Postgres write) |
| Marketing site | `mcpfold.com` loads; `/docs` + `/schema/v1.json` resolve |
| Web console | `app.mcpfold.com` signs in; a cross-tenant read is denied |
| npm | `npx mcpfold@latest --version` matches the release |
