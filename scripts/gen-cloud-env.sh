#!/usr/bin/env bash
# gen-cloud-env.sh — bootstrap every secret the mcpfold cloud needs and print ready-to-paste
# environment blocks for each surface (Supabase/Coolify, the side edge container, the web Pages
# project). See docs/deployment.md §4 for what each variable is.
#
# It generates the random secrets (openssl) AND mints the Supabase ANON_KEY / SERVICE_ROLE_KEY as
# HS256 JWTs signed with the generated JWT_SECRET — the same trust anchor the edge service and the
# web anon key share. Nothing is written to disk; copy the output into Coolify / Cloudflare Pages
# (or Infisical). Re-running generates a fresh, unrelated set.
#
# Usage:
#   bash scripts/gen-cloud-env.sh                 # print all env blocks
#   bash scripts/gen-cloud-env.sh > cloud.env     # capture (then move into your secret store, do
#                                                 # NOT commit — .env* is gitignored)
#
# Requires: bash, openssl. No network, no repo state.
set -euo pipefail

if ! command -v openssl >/dev/null 2>&1; then
  echo "error: openssl is required" >&2
  exit 1
fi

# --- base64url + HS256 JWT minting -------------------------------------------------------------
b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

# mint_jwt <role> — a long-lived (10y) Supabase JWT for `anon` / `service_role`, signed HS256.
mint_jwt() {
  local role="$1" iat exp header payload signature
  iat="$(date +%s)"
  exp="$((iat + 315360000))" # ~10 years
  header="$(printf '%s' '{"alg":"HS256","typ":"JWT"}' | b64url)"
  payload="$(printf '{"role":"%s","iss":"supabase","iat":%s,"exp":%s}' "$role" "$iat" "$exp" | b64url)"
  signature="$(printf '%s' "${header}.${payload}" \
    | openssl dgst -binary -sha256 -hmac "$JWT_SECRET" | b64url)"
  printf '%s.%s.%s' "$header" "$payload" "$signature"
}

# --- generate the secrets ----------------------------------------------------------------------
POSTGRES_PASSWORD="$(openssl rand -hex 24)"
JWT_SECRET="$(openssl rand -hex 32)"          # >= 32 chars; shared with the edge service
REALTIME_ENC_KEY="$(openssl rand -hex 16)"    # 32 hex chars
REALTIME_SECRET_KEY_BASE="$(openssl rand -hex 32)" # 64 hex chars
ANON_KEY="$(mint_jwt anon)"
SERVICE_ROLE_KEY="$(mint_jwt service_role)"

# --- domains (override via env if yours differ) ------------------------------------------------
: "${APEX:=mcpfold.com}"
: "${API_HOST:=api.${APEX}}"

cat <<EOF
# ===============================================================================================
# mcpfold cloud environment — generated $(date -u +%Y-%m-%dT%H:%M:%SZ)
# Paste each block into the matching surface. NEVER commit filled-in values (.env* is gitignored).
# The SAME JWT_SECRET must be set in BOTH the Supabase stack and the edge service.
# ===============================================================================================

# ---- Supabase stack (Coolify env for supabase/docker-compose.coolify.yml) ---------------------
POSTGRES_DB=postgres
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRY=3600
ANON_KEY=${ANON_KEY}
SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}
API_EXTERNAL_URL=https://${API_HOST}
SITE_URL=https://${APEX}
ADDITIONAL_REDIRECT_URLS=https://${APEX}/auth/callback
REALTIME_ENC_KEY=${REALTIME_ENC_KEY}
REALTIME_SECRET_KEY_BASE=${REALTIME_SECRET_KEY_BASE}
GITHUB_OAUTH_ENABLED=false
GITHUB_OAUTH_CLIENT_ID=
GITHUB_OAUTH_SECRET=
DISABLE_SIGNUP=false

# ---- Side edge service (Coolify env for services/edge) ----------------------------------------
# DATABASE_URL: prefer the internal Docker network host over the public one.
DATABASE_URL=postgres://postgres:${POSTGRES_PASSWORD}@db:5432/postgres
JWT_SECRET=${JWT_SECRET}
SITE_URL=https://${APEX}
JWT_EXPIRY=3600
PORT=8000

# ---- Web console (Cloudflare Pages 'mcpfold-web' build-time env) -------------------------------
# ANON_KEY is a public JWT (safe in the browser; RLS enforces access).
VITE_SUPABASE_URL=https://${API_HOST}
VITE_SUPABASE_ANON_KEY=${ANON_KEY}
# VITE_API_URL only if the edge is on a different origin than Supabase (see docs/deployment.md §3)

# ---- Reminders --------------------------------------------------------------------------------
# * Marketing site (mcpfold-site) needs NO secrets — optional VITE_ANALYTICS_SRC / _DOMAIN only.
# * GitHub repo secrets are separate: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, NPM_TOKEN.
# * After deploy, apply migrations to the LIVE db: DATABASE_URL=... supabase/scripts/migrate.sh
EOF
