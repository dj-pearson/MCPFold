# @mcpfold/edge — Supabase edge functions (Deno)

Server-side handlers for mcpfold cloud. Deno + `npm:postgres`, sharing the self-hosted
Supabase JWT/RLS contract. Deployed either on the managed Supabase Edge runtime or as the
standalone side Docker service (S6.5). **Closed-source / commercial** — not part of the MIT
CLI+core, and outside the pnpm workspace (Deno tooling, not pnpm).

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

- **Only `approve` is authenticated** — it verifies the browser user's GoTrue JWT with the
  shared `JWT_SECRET` (same trust as PostgREST/RLS) and binds the request to that user.
  `start`/`poll`/`refresh` are guarded by the unguessable `device_code` / refresh token.
- The access token is a stateless **HS256 JWT** carrying `sub` + `role: authenticated` +
  `aud: authenticated`, so PostgREST and the RLS policies (S6.2) accept it like any
  GoTrue-issued token.
- **Secrets are stored hashed**: only the SHA-256 of the `device_code` and refresh token
  ever touch the database (`public.device_codes`, `public.sessions` — migration `0003`).
  Those tables are deny-by-default under RLS; only `service_role` reads them.
- The CLI stores the returned session **in the OS keychain, never a plaintext file**
  (`packages/cli/src/cloud/token-store.ts`); `mcpfold login` (S6.6) wires it in.
- Refresh-token **rotation + reuse-detection** and per-machine **revocation** are hardened
  in S9.5.

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

The integration test skips itself when `DATABASE_URL` is unset. CI runs the full suite in the
`db` job (see `.github/workflows/ci.yml`).
