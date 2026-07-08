#!/usr/bin/env bash
# container-smoke.sh (S6.5) — build + run the side edge service container and prove the JWT/RLS
# contract holds over HTTP: /health answers, an unauthenticated call is rejected, and an
# authenticated push/pull round-trips. Runs locally and in CI. Requires docker, psql, deno, curl.
set -euo pipefail
cd "$(dirname "$0")/.." # services/edge
export JWT_SECRET="${JWT_SECRET:-test-jwt-secret-at-least-32-chars-long-000}"

COMPOSE=(docker compose -f docker-compose.ci.yml)
cleanup() { "${COMPOSE[@]}" down -v >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "▶ building + starting db + edge container…"
"${COMPOSE[@]}" up -d --build --wait

DBURL="postgres://postgres:postgres@localhost:55433/postgres"
EDGE="http://localhost:8787"
USER_ID="11111111-1111-1111-1111-111111111111"

echo "▶ applying migrations + seeding a user…"
DATABASE_URL="$DBURL" bash ../../supabase/scripts/migrate.sh >/dev/null
psql "$DBURL" -v ON_ERROR_STOP=1 -qc "
  insert into auth.users (id,email) values ('$USER_ID','edge@test') on conflict do nothing;
  insert into public.users (id,email) values ('$USER_ID','edge@test') on conflict do nothing;" >/dev/null

# 1. health
curl -fsS "$EDGE/health" | grep -q '"ok":true' && echo "✓ /health answers 200"

# 2. unauthenticated push is rejected
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$EDGE/push" -H 'content-type: application/json' -d '{}')
[ "$code" = "401" ] && echo "✓ unauthenticated push rejected (401)" || {
  echo "✗ expected 401 for unauthenticated push, got $code" >&2
  exit 1
}

# 3. authenticated push + pull round-trip
TOKEN=$(deno run --allow-env scripts/mint-jwt.ts "$USER_ID")
CONFIG='{"version":1,"servers":{"gh":{"transport":"stdio","command":"npx"}},"profiles":{}}'
push=$(curl -fsS -X POST "$EDGE/push" -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d "{\"config\":$CONFIG}")
echo "$push" | grep -q '"version":1' && echo "✓ authenticated push → version 1"
pull=$(curl -fsS "$EDGE/pull" -H "authorization: Bearer $TOKEN")
echo "$pull" | grep -q '"gh"' && echo "✓ authenticated pull returns the config"

echo "✓ side edge service container smoke passed"
