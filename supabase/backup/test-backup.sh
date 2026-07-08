#!/usr/bin/env bash
# test-backup.sh (S9.4) — prove the encrypted backup is (a) opaque at rest and (b) restorable.
#
#   1. seed a probe row;
#   2. run encrypt-backup.sh;
#   3. assert the ciphertext reveals no plaintext (sentinel + schema names absent);
#   4. assert the wrong key cannot decrypt;
#   5. run restore-backup.sh into a FRESH database and verify the probe row survives.
#
# The pg client is run INSIDE the DB container (MCPFOLD_PG_CONTAINER) so pg_dump matches the
# server version; without it, host binaries are used (they must match the server).
set -euo pipefail

SENTINEL="BACKUP_ROUNDTRIP_a1b2c3d4"
export BACKUP_ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:-ci-backup-test-key-not-a-real-secret-00}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

if [ -n "${MCPFOLD_PG_CONTAINER:-}" ]; then
  export PG_RUN="docker exec -i ${MCPFOLD_PG_CONTAINER}"
  DBURL="postgres://postgres:postgres@localhost:5432/postgres"
else
  export PG_RUN=""
  DBURL="${DATABASE_URL:?set DATABASE_URL or MCPFOLD_PG_CONTAINER}"
fi
BASE="${DBURL%/*}"
RESTORE_DB="backup_restore_test"

psql_run() { $PG_RUN psql "$1" -v ON_ERROR_STOP=1 -tAqc "$2"; }

# 1. Seed a probe row.
psql_run "$DBURL" "create table if not exists public.backup_probe(id int primary key, v text);
                   truncate public.backup_probe;
                   insert into public.backup_probe values (1, '$SENTINEL');" >/dev/null

TMP="$(mktemp -d)"; ENC="$TMP/backup.sql.gz.enc"
trap 'rm -rf "$TMP"' EXIT

# 2. Encrypted backup.
DATABASE_URL="$DBURL" bash "$ROOT/supabase/backup/encrypt-backup.sh" "$ENC" >/dev/null

# 3. At-rest opacity.
if grep -qa "$SENTINEL" "$ENC"; then echo "✗ sentinel plaintext found in encrypted backup" >&2; exit 1; fi
if grep -qa "backup_probe" "$ENC"; then echo "✗ table name readable in encrypted backup" >&2; exit 1; fi
echo "✓ encrypted backup is opaque (sentinel + schema names absent from ciphertext)"

# 4. Wrong key cannot decrypt.
if BACKUP_ENCRYPTION_KEY="the-wrong-key-00000000000000000000" \
     openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_ENCRYPTION_KEY -in "$ENC" \
     >/dev/null 2>&1; then
  echo "✗ decryption succeeded with the wrong key" >&2; exit 1
fi
echo "✓ wrong key cannot decrypt the backup"

# 5. Restore into a fresh database, verify.
psql_run "$DBURL" "drop database if exists $RESTORE_DB;" >/dev/null
psql_run "$DBURL" "create database $RESTORE_DB;" >/dev/null
DATABASE_URL="$BASE/$RESTORE_DB" bash "$ROOT/supabase/backup/restore-backup.sh" "$ENC" >/dev/null
GOT="$(psql_run "$BASE/$RESTORE_DB" "select v from public.backup_probe where id = 1;")"
[ "$GOT" = "$SENTINEL" ] || { echo "✗ restore mismatch: got '$GOT'" >&2; exit 1; }
echo "✓ encrypt → restore round-trip verified (probe row recovered into a fresh DB)"

# cleanup
psql_run "$DBURL" "drop database if exists $RESTORE_DB;" >/dev/null 2>&1 || true
psql_run "$DBURL" "drop table if exists public.backup_probe;" >/dev/null 2>&1 || true
echo "✓ backup encrypt/restore test passed"
