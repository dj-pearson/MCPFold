# Self-hosting the cloud (Supabase + Coolify)

The `mcpfold` cloud (auth + config sync + teams) runs on **self-hosted Supabase** deployed
with **Coolify** on your own VPS. This page covers standing it up, the migration workflow,
and where secrets come from. The web frontend (Cloudflare Pages) is separate — see the web
app docs once it lands.

> **Local-first stays free.** Everything the CLI does — `init`/`import`/`add`/`sync`/`diff`/
> `doctor`/`run` — works with no account and no server. The cloud is an optional sync layer.

## Layout

Everything lives under [`supabase/`](../supabase):

| File                         | Purpose                                                            |
| ---------------------------- | ------------------------------------------------------------------ |
| `config.toml`                | Supabase CLI project config.                                       |
| `migrations/*.sql`           | Schema, applied in filename order (S6.2 adds the tables).          |
| `seed.sql`                   | Dev/local seed data (no secrets, no real data).                    |
| `scripts/migrate.sh`         | `supabase db push`-style runner (psql-only, no CLI/Docker needed). |
| `scripts/smoke-test.sh`      | Post-migration integration assertions (used by CI).                |
| `docker-compose.ci.yml`      | Minimal Postgres for CI + local schema work.                       |
| `docker-compose.coolify.yml` | Full stack (Postgres/GoTrue/PostgREST/Realtime + Kong) to deploy.  |
| `kong.yml`                   | API-gateway routes for the full stack.                             |
| `.env.example`               | Every required env var, with generation commands.                  |

## Secrets — where they come from

**No secret is ever committed.** `supabase/.env.example` documents each variable; real
values live in **Coolify's env** (or **Infisical**, referenced the same way the CLI
resolves `${infisical:...}`). Generate them:

```bash
openssl rand -hex 24   # POSTGRES_PASSWORD
openssl rand -hex 32   # JWT_SECRET  (>= 32 chars)
openssl rand -hex 16   # REALTIME_ENC_KEY  (32 hex chars)
openssl rand -hex 32   # REALTIME_SECRET_KEY_BASE  (64 hex chars)
```

`ANON_KEY` and `SERVICE_ROLE_KEY` are JWTs signed with `JWT_SECRET`; mint them with the
[Supabase self-hosting key generator](https://supabase.com/docs/guides/self-hosting#api-keys).
`.env` and `.env.*` are gitignored (only `.env.example` is tracked), so a filled-in file
can't be committed by accident.

## Deploy on Coolify

1. In Coolify, create a new **Docker Compose** resource pointing at
   `supabase/docker-compose.coolify.yml`.
2. Set every variable from `.env.example` in the resource's **Environment Variables**
   (or wire Infisical). Confirm image tags against the current
   [`supabase/docker`](https://github.com/supabase/supabase/tree/master/docker) set.
3. Point a subdomain (e.g. `api.mcpfold.com`) at the Kong gateway (`:8000`); let Coolify
   terminate TLS in front of it (this is also where HSTS is enforced — see S9.4).
4. Deploy. This brings up **Postgres, GoTrue (auth), PostgREST (rest), and Realtime**.
5. Apply migrations against the running database (next section).

## Migration workflow (`supabase db push`-style)

Migrations are plain SQL in `supabase/migrations/`, applied in filename order exactly once
each, tracked in `public.schema_migrations`. The runner needs only `psql` — no Docker, no
Supabase CLI — so it works identically locally, in CI, and against the deployed DB:

```bash
# Against the Coolify database (URL/password from your secret store):
DATABASE_URL='postgres://postgres:PASSWORD@api.mcpfold.com:5432/postgres' \
  supabase/scripts/migrate.sh

# With seed data (dev only):
SEED=1 DATABASE_URL=... supabase/scripts/migrate.sh
```

If you use the Supabase CLI, `supabase db push` applies the same `migrations/` directory —
the script and the CLI are interchangeable. Add a migration by dropping a new
`NNNN_name.sql` file in `migrations/`; the next run applies just the new ones.

## Local + CI integration testing

Bring the database up locally exactly as CI does:

```bash
docker compose -f supabase/docker-compose.ci.yml up -d
DATABASE_URL='postgres://postgres:postgres@localhost:54322/postgres' \
  supabase/scripts/migrate.sh
DATABASE_URL='postgres://postgres:postgres@localhost:54322/postgres' \
  supabase/scripts/smoke-test.sh
docker compose -f supabase/docker-compose.ci.yml down -v
```

CI runs this on every push (the **`db`** job in
[`ci.yml`](../.github/workflows/ci.yml)): it stands up `docker-compose.ci.yml`, applies
migrations, runs the smoke test (which also asserts `migrate.sh` is idempotent), and fails
the build on any error. So a broken migration is caught before it reaches the deployment.
