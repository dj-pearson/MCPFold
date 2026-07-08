# supabase/

Self-hosted Supabase for the `mcpfold` cloud (auth + config sync + teams), deployed with
Coolify. Full guide: [`docs/self-hosting.md`](../docs/self-hosting.md).

**Quick reference**

```bash
# Local DB (same as CI):
docker compose -f docker-compose.ci.yml up -d
DATABASE_URL='postgres://postgres:postgres@localhost:54322/postgres' scripts/migrate.sh
DATABASE_URL='postgres://postgres:postgres@localhost:54322/postgres' scripts/smoke-test.sh

# Add a migration: drop supabase/migrations/NNNN_name.sql and re-run migrate.sh.
```

- **Deploy** → `docker-compose.coolify.yml` (full Postgres/GoTrue/PostgREST/Realtime stack).
- **Secrets** → env / Infisical only. Copy `.env.example`; never commit a filled-in `.env`.
- **Migrations** → plain SQL in `migrations/`, applied in filename order, tracked in
  `public.schema_migrations`. The tables themselves land in S6.2.
