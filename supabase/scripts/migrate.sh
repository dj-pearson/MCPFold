#!/usr/bin/env bash
# migrate.sh (S6.1) — apply supabase/migrations/*.sql to a target database, in filename
# order, exactly once each. A `supabase db push`-style workflow with no dependency on the
# Supabase CLI or Docker, so it runs the same locally, in CI, and against the Coolify
# deployment. Applied migrations are tracked in public.schema_migrations.
#
# Usage:
#   DATABASE_URL=postgres://user:pass@host:5432/db supabase/scripts/migrate.sh
#   SEED=1 DATABASE_URL=... supabase/scripts/migrate.sh   # also apply seed.sql
#
# The DB password / URL comes from the environment (or Infisical) — never hardcode it.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set (e.g. postgres://postgres:PASS@localhost:5432/postgres)}"

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS="$DIR/migrations"

psql_do() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q "$@"; }

# Ledger of applied migrations.
psql_do -c "create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);"

applied=0
for file in "$MIGRATIONS"/*.sql; do
  [ -e "$file" ] || continue
  version="$(basename "$file" .sql)"
  already="$(psql "$DATABASE_URL" -tAc \
    "select 1 from public.schema_migrations where version = '$version'")"
  if [ "$already" = "1" ]; then
    echo "= skip  $version (already applied)"
    continue
  fi
  echo "→ apply $version"
  # Each migration + its ledger insert run in ONE transaction: a failure rolls back both,
  # so a half-applied migration is never recorded as done.
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q --single-transaction \
    -f "$file" \
    -c "insert into public.schema_migrations (version) values ('$version');"
  applied=$((applied + 1))
done

echo "✓ migrations up to date ($applied applied this run)"

if [ "${SEED:-0}" = "1" ] && [ -f "$DIR/seed.sql" ]; then
  echo "→ seed"
  psql_do -f "$DIR/seed.sql"
  echo "✓ seeded"
fi
