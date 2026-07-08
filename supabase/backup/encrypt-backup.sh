#!/usr/bin/env bash
# encrypt-backup.sh (S9.4) — an encrypted-at-rest Postgres backup for the self-hosted stack.
#
# Self-hosting means WE own backup encryption (managed Supabase gives it for free). This pipes
# pg_dump straight into gzip and AES-256 (OpenSSL, PBKDF2 key derivation) so the plaintext dump
# never touches disk — only the encrypted artifact is written.
#
#   DATABASE_URL=postgres://... BACKUP_ENCRYPTION_KEY=... supabase/backup/encrypt-backup.sh [out]
#
# BACKUP_ENCRYPTION_KEY comes from your secret store (Coolify env / Infisical) and is NEVER
# committed. Store the encrypted artifacts off-box (object storage); rotate the key per your
# policy. Restore with restore-backup.sh.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL must be set}"
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY must be set (>= 16 chars; from your secret store)}"

if [ "${#BACKUP_ENCRYPTION_KEY}" -lt 16 ]; then
  echo "✗ BACKUP_ENCRYPTION_KEY is too short (>= 16 chars required)" >&2
  exit 1
fi

OUT="${1:-backup.sql.gz.enc}"

# Optional prefix to run the pg client through (e.g. `docker exec -i <container>`), so pg_dump
# matches the server version. Empty by default → host pg_dump (ensure it matches your server).
PG_RUN="${PG_RUN:-}"

# pg_dump → gzip → AES-256-CBC (salted, PBKDF2). No intermediate plaintext file is written.
$PG_RUN pg_dump "$DATABASE_URL" \
  | gzip \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_ENCRYPTION_KEY -out "$OUT"

echo "✓ wrote encrypted backup: $OUT ($(wc -c <"$OUT") bytes)"
