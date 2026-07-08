# Side edge service (Coolify)

The mcpfold cloud API (device-code auth + config push/pull) runs as a small **standalone Deno
container** — the "side service" — so it can be hosted anywhere Coolify runs containers, not only
inside the managed Supabase Edge runtime. It shares the exact same JWT/RLS contract as the
in-Supabase functions: every request is authenticated with a Supabase-issued JWT and scoped by
the S6.2 row-level-security policies. The container grants no privilege the functions don't.

See also [Self-hosting](self-hosting.md) (the Supabase stack) and
[At-rest hardening](security-at-rest.md).

## What it exposes

```
GET  /health                 → { ok: true, service: "mcpfold-edge" }
POST /auth-device/{start,approve,poll,refresh}
POST /push        GET/POST /pull
```

## Build & run

```bash
docker build -t mcpfold-edge services/edge
docker run --rm -p 8000:8000 \
  -e DATABASE_URL="postgres://…"  \
  -e JWT_SECRET="$JWT_SECRET"      \
  -e SITE_URL="https://mcpfold.com" \
  mcpfold-edge
```

The image runs as the non-root `deno` user with least-privilege permissions
(`--allow-net --allow-env`) and a Docker `HEALTHCHECK` that polls `/health`. On `SIGTERM`/`SIGINT`
it drains in-flight requests and closes the DB pool (graceful shutdown), so Coolify rollouts don't
drop connections.

## Configuration (environment only — never in the image)

| Var            | Purpose                                                       |
| -------------- | ------------------------------------------------------------- |
| `DATABASE_URL` | Postgres connection to the Supabase DB (or `SUPABASE_DB_URL`) |
| `JWT_SECRET`   | ≥32 chars; the SAME secret the Supabase stack signs with      |
| `SITE_URL`     | Base for device-code verification URLs                        |
| `JWT_EXPIRY`   | Access-token lifetime, seconds (default 3600)                 |
| `PORT`         | HTTP port (default 8000)                                      |

No secret is baked into the image — all of the above come from Coolify env vars / Infisical at
runtime. TLS terminates at Coolify's reverse proxy (see [At-rest hardening](security-at-rest.md));
the service already sets HSTS + hardening headers on every response.

## Deploy in Coolify

1. New Resource → **Dockerfile** application, pointed at `services/edge` (Dockerfile at its root).
2. Set the environment variables above as Coolify secrets (mark them secret; never commit).
3. Expose port 8000; put it behind the Coolify/Traefik HTTPS proxy at e.g. `api.mcpfold.com`.
4. Coolify uses the image `HEALTHCHECK` for zero-downtime rollouts.

## CI

`services/edge/scripts/container-smoke.sh` (run by the **edge container** CI job) builds the image,
brings up Postgres + the container via `docker-compose.ci.yml`, applies migrations, and asserts:
`/health` answers, an unauthenticated push is rejected (401), and an authenticated push→pull
round-trips — proving the container honors the JWT/RLS contract before it ships.
