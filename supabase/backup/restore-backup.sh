#!/usr/bin/env bash
# restore-backup.sh (S9.4) — decrypt + restore an encrypt-backup.sh artifact.
#
#   DATABASE_URL=postgres://... BACKUP_ENCRYPTION_KEY=... \
#     supabase/backup/restore-backup.sh <file.sql.gz.enc>
#
# Restores into DATABASE_URL (point it at a FRESH/empty database to avoid clobbering a live one).
# The decrypted plaintext is streamed to psql and never written to disk.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL must be set (target — use a fresh/empty database)}"
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY must be set}"
IN="${1:?usage: restore-backup.sh <file.sql.gz.enc>}"
[ -f "$IN" ] || { echo "✗ no such backup file: $IN" >&2; exit 1; }

# Optional prefix to run the pg client through (e.g. `docker exec -i <container>`) so psql
# matches the server version. Empty by default → host psql.
PG_RUN="${PG_RUN:-}"

openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_ENCRYPTION_KEY -in "$IN" \
  | gunzip \
  | $PG_RUN psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --quiet

echo "✓ restored $IN into the target database"
