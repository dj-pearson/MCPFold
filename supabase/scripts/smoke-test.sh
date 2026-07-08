#!/usr/bin/env bash
# smoke-test.sh (S6.1) — assert the migration bootstrap actually took, against whatever
# DATABASE_URL points at. Run after migrate.sh; used by the CI `db` job as an integration
# check that the compose + migration workflow work end to end.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL must be set}"

fail() {
  echo "✗ $1" >&2
  exit 1
}

check() {
  local label="$1" sql="$2"
  [ "$(psql "$DATABASE_URL" -tAc "$sql")" = "1" ] || fail "$label"
  echo "✓ $label"
}

check "0001_init recorded in schema_migrations" \
  "select 1 from public.schema_migrations where version = '0001_init'"
check "extensions schema exists" \
  "select 1 from information_schema.schemata where schema_name = 'extensions'"
check "pgcrypto extension installed" \
  "select 1 from pg_extension where extname = 'pgcrypto'"
check "role anon exists" "select 1 from pg_roles where rolname = 'anon'"
check "role authenticated exists" "select 1 from pg_roles where rolname = 'authenticated'"
check "role service_role exists" "select 1 from pg_roles where rolname = 'service_role'"

# Re-running migrate.sh must be a no-op (idempotency), not a duplicate/error.
before="$(psql "$DATABASE_URL" -tAc 'select count(*) from public.schema_migrations')"
DATABASE_URL="$DATABASE_URL" "$(dirname "${BASH_SOURCE[0]}")/migrate.sh" >/dev/null
after="$(psql "$DATABASE_URL" -tAc 'select count(*) from public.schema_migrations')"
[ "$before" = "$after" ] || fail "migrate.sh is not idempotent ($before → $after)"
echo "✓ migrate.sh is idempotent"

echo "✓ smoke test passed"
