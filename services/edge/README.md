# @mcpfold/edge — Supabase edge functions (Deno)

Server-side handlers for mcpfold cloud. Deno + `npm:postgres`, sharing the self-hosted Supabase
JWT/RLS contract. Deployed either on the managed Supabase Edge runtime or as the standalone side
Docker service (S6.5). **Closed-source / commercial** — not part of the MIT CLI+core, and outside
the pnpm workspace (Deno tooling, not pnpm).

## Auth: device-code OAuth (S6.3)

`mcpfold login` uses an RFC 8628-style device-code flow so the CLI never handles a password:

```
POST …/auth-device/start     { machine_name? }
      → { device_code, user_code, verification_uri, verification_uri_complete,
          expires_in, interval }

# user opens verification_uri in a browser, signs in (GoTrue), enters user_code
POST …/auth-device/approve   Authorization: Bearer <gotrue-jwt>   { user_code }
      → { ok: true }

POST …/auth-device/poll      { device_code }
      → 200 { access_token, refresh_token, token_type, expires_in }   (once approved)
      → 400 { error: "authorization_pending", interval }              (still waiting)
      → 400 { error: "expired_token" }                                (expired / already used)

POST …/auth-device/refresh   { refresh_token }
      → { access_token, token_type, expires_in }

GET  …/auth-device/health    → { ok: true }
```

Design properties:

- **Only `approve` is authenticated** — it verifies the browser user's GoTrue JWT with the shared
  `JWT_SECRET` (same trust as PostgREST/RLS) and binds the request to that user.
  `start`/`poll`/`refresh` are guarded by the unguessable `device_code` / refresh token.
- The access token is a stateless **HS256 JWT** carrying `sub` + `role: authenticated` +
  `aud: authenticated`, so PostgREST and the RLS policies (S6.2) accept it like any GoTrue-issued
  token.
- **Secrets are stored hashed**: only the SHA-256 of the `device_code` and refresh token ever touch
  the database (`public.device_codes`, `public.sessions` — migration `0003`). Those tables are
  deny-by-default under RLS; only `service_role` reads them.
- The CLI stores the returned session **in the OS keychain, never a plaintext file**
  (`packages/cli/src/cloud/token-store.ts`); `mcpfold login` (S6.6) wires it in.
- Refresh-token **rotation + reuse-detection** and per-machine **revocation** are hardened in S9.5.

## Sync: push / pull (S6.4)

Cross-machine config sync. The canonical config is stored **with secret references intact** — never
resolved values — as an append-only version history.

```
POST …/push   Authorization: Bearer <access-token>
      { config: <canonical, refs only>, team_id?, machine_name? }
      → 201 { id, version, created_at }

GET  …/pull?team_id=<uuid>&version=<n>   Authorization: Bearer <access-token>
POST …/pull   { team_id?, version? }
      → 200 { id, version, config, created_at, created_by }   (latest by default)
      → 404 { error: "not_found" }
```

Design properties:

- **Authenticated + RLS-scoped**: the access token identifies the user; every query runs _as_ that
  user (role `authenticated` + the `auth.uid()` GUC) so the S6.2 row-level-security policies are
  genuinely enforced — a cross-tenant pull returns `not_found`, a push to a team you're not in is
  `403`.
- **Config-only**: `push` validates the payload and rejects (`400 raw_secret`) any config that
  carries a raw secret value; only `${scheme:path}` references may be synced. This mirrors the
  `config_is_ref_only` DB CHECK (0002) and the CLI push guard (S9.1) — three layers.
- **Append-only**: every `push` inserts a new row; the DB trigger assigns the next version. A push
  never overwrites. History is queryable via `pull?version=`.
- **Conflict strategy**: last-write-wins with full version history. `pull` returns the latest
  version; the CLI diffs it against local (S1.6) before applying, and a user who pushed from a stale
  base simply creates a newer version — nothing is lost, and the audit trail (S6.2) shows every
  version.

## Side Docker service (S6.5)

The same handlers run as a standalone container (`Dockerfile`) — the "side service" — for hosting
anywhere Coolify runs containers, sharing the exact JWT/RLS contract. `main.ts` → `src/server.ts`
serves `/health` + auth/push/pull with graceful shutdown (SIGTERM drains + closes the DB pool).

```bash
docker build -t mcpfold-edge .                 # non-root deno user, HEALTHCHECK on /health
bash scripts/container-smoke.sh                # build + run + assert the contract over HTTP
```

`scripts/container-smoke.sh` (CI **edge container** job) stands up Postgres + the container via
`docker-compose.ci.yml` and proves: `/health` answers, unauthenticated push is rejected (401), and
an authenticated push→pull round-trips. See `docs/coolify-edge-service.md` for the Coolify deploy.

## Configuration (environment only — never committed)

| Var            | Purpose                                             |
| -------------- | --------------------------------------------------- |
| `DATABASE_URL` | Postgres connection (or `SUPABASE_DB_URL`)          |
| `JWT_SECRET`   | ≥32 chars; shared with Supabase for signing/verify  |
| `SITE_URL`     | Base for the verification URL (default mcpfold.com) |
| `JWT_EXPIRY`   | Access-token lifetime, seconds (default 3600)       |
| `PORT`         | HTTP port for the standalone service (default 8000) |

## Develop & test

```bash
# Unit tests only (crypto/JWT/codes — no database):
deno task test:unit

# Full suite incl. the device-code integration test — needs the CI Supabase DB up + migrated:
docker compose -f ../../supabase/docker-compose.ci.yml up -d --wait
DATABASE_URL=postgres://postgres:postgres@localhost:54322/postgres \
  bash ../../supabase/scripts/migrate.sh
DATABASE_URL=postgres://postgres:postgres@localhost:54322/postgres \
  JWT_SECRET=test-jwt-secret-at-least-32-chars-long-000 \
  deno task test

deno task check   # type-check      deno task lint   # lint      deno task fmt   # format
```

The integration test skips itself when `DATABASE_URL` is unset. CI runs the full suite in the `db`
job (see `.github/workflows/ci.yml`).
