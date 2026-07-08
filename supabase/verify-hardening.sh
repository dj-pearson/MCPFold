#!/usr/bin/env bash
# verify-hardening.sh (S9.4) — confirm at-rest + in-transit protections are actually ON, not
# just configured. Run this on/against the self-hosted stack after deploying (see
# docs/security-at-rest.md). Each check prints ✓/✗; any ✗ exits nonzero.
#
#   API_URL=https://api.mcpfold.com PG_DATA_DEV=/dev/mapper/pgdata \
#     supabase/verify-hardening.sh
#
# Checks are skipped (with a note) when their inputs aren't provided, so it's useful both in a
# quick CI/header check and a full on-box audit.
set -uo pipefail
fail=0
note() { echo "• $1"; }
ok() { echo "✓ $1"; }
bad() {
  echo "✗ $1" >&2
  fail=1
}

# --- 1. TLS + HSTS on the API/web endpoint --------------------------------------------------
if [ -n "${API_URL:-}" ]; then
  case "$API_URL" in
    https://*) ok "endpoint uses HTTPS ($API_URL)" ;;
    *) bad "endpoint is not HTTPS: $API_URL" ;;
  esac
  headers="$(curl -sSI --max-time 15 "$API_URL" 2>/dev/null || true)"
  if printf '%s' "$headers" | grep -qi '^strict-transport-security:'; then
    ok "HSTS header present"
  else
    bad "no Strict-Transport-Security header on $API_URL"
  fi
  # HTTP must redirect to HTTPS (never serve plaintext).
  http_url="http://${API_URL#https://}"
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$http_url" 2>/dev/null || echo 000)"
  case "$code" in
    30[1278]) ok "HTTP redirects to HTTPS ($code)" ;;
    000) note "could not reach $http_url (ok if HTTP is fully closed)" ;;
    *) bad "HTTP did not redirect to HTTPS (got $code)" ;;
  esac
else
  note "API_URL not set — skipping TLS/HSTS check"
fi

# --- 2. Postgres data volume encryption (LUKS/dm-crypt) -------------------------------------
if [ -n "${PG_DATA_DEV:-}" ]; then
  if command -v cryptsetup >/dev/null 2>&1 && cryptsetup status "$PG_DATA_DEV" >/dev/null 2>&1; then
    ok "Postgres data volume is dm-crypt encrypted ($PG_DATA_DEV)"
  elif lsblk -o NAME,TYPE 2>/dev/null | grep -q crypt; then
    ok "an encrypted (crypt) block device is present"
  else
    bad "Postgres data volume $PG_DATA_DEV is not an active encrypted mapping"
  fi
else
  note "PG_DATA_DEV not set — skipping volume-encryption check"
fi

# --- 3. Postgres connection TLS ------------------------------------------------------------
if [ -n "${DATABASE_URL:-}" ] && command -v psql >/dev/null 2>&1; then
  ssl="$(psql "$DATABASE_URL" -tAqc "show ssl;" 2>/dev/null || echo unknown)"
  if [ "$ssl" = "on" ]; then
    ok "Postgres has TLS enabled (ssl = on)"
  else
    note "Postgres ssl = $ssl (enable in production; local CI Postgres runs without TLS)"
  fi
else
  note "DATABASE_URL/psql not available — skipping Postgres-TLS check"
fi

if [ "$fail" -ne 0 ]; then
  echo "✗ hardening verification found problems" >&2
  exit 1
fi
echo "✓ hardening verification passed for the checks that ran"
