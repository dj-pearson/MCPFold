#!/usr/bin/env bash
# test-rls.sh (S6.2) — prove the schema's security properties against a live database:
#   1. RLS tenant isolation: user A cannot read user B's configs.
#   2. configs is append-only: an in-place UPDATE is rejected.
#   3. config stores REFERENCES only: a raw token is rejected by the CHECK.
#   4. team config history feeds the audit view.
#
# Run after migrate.sh. Impersonates users via `set role authenticated` + the
# app.current_user_id GUC that auth.uid() reads on the CI database.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL must be set}"

A='11111111-1111-1111-1111-111111111111'
B='22222222-2222-2222-2222-222222222222'

q() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -tAqc "$1"; }
fail() {
  echo "✗ $1" >&2
  exit 1
}

# --- Seed two users as the trusted owner (RLS bypassed) --------------------------------
q "reset role;
   insert into auth.users (id, email) values
     ('$A','a@test'), ('$B','b@test') on conflict do nothing;
   insert into public.users (id, email) values
     ('$A','a@test'), ('$B','b@test') on conflict do nothing;" >/dev/null

# --- Each user inserts a personal config, as themselves under RLS ----------------------
insert_cfg() {
  local uid="$1" srv="$2"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -qc "
    set app.current_user_id = '$uid';
    set role authenticated;
    insert into public.configs (owner_id, created_by, config)
    values ('$uid','$uid', '{\"version\":1,\"servers\":{\"$srv\":{\"transport\":\"stdio\",\"command\":\"npx\"}},\"profiles\":{}}');
  " >/dev/null
}
insert_cfg "$A" "a_server"
insert_cfg "$B" "b_server"

# --- 1. Tenant isolation ---------------------------------------------------------------
a_sees=$(q "set app.current_user_id='$A'; set role authenticated;
            select count(*) from public.configs;")
[ "$a_sees" = "1" ] || fail "A should see exactly its 1 config, saw $a_sees"
echo "✓ A sees only its own config"

a_sees_b=$(q "set app.current_user_id='$A'; set role authenticated;
              select count(*) from public.configs where owner_id='$B';")
[ "$a_sees_b" = "0" ] || fail "A must not see B's configs (saw $a_sees_b)"
echo "✓ A cannot read B's configs (RLS isolation)"

# --- 2. Append-only ---------------------------------------------------------------------
# 2a. Under RLS there is no UPDATE policy, so a user's UPDATE matches zero rows (silently
#     blocked — it changes nothing).
a_updated=$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -tAqc "
    set app.current_user_id='$A'; set role authenticated;
    with u as (update public.configs set version=version where owner_id='$A' returning 1)
    select count(*) from u;")
[ "$a_updated" = "0" ] || fail "RLS should block a user UPDATE (rows touched: $a_updated)"
echo "✓ RLS grants no UPDATE on configs (0 rows touched)"

# 2b. Even the table owner (RLS bypassed) is stopped by the immutability trigger.
if psql "$DATABASE_URL" -qc "
     reset role;
     update public.configs set config='{\"version\":1,\"servers\":{},\"profiles\":{}}'
     where owner_id='$A';" >/dev/null 2>&1; then
  fail "the immutability trigger should reject any in-place UPDATE"
fi
echo "✓ config UPDATE is rejected by the immutability trigger (append-only)"

# --- 3. Reference-only: raw token rejected ---------------------------------------------
if psql "$DATABASE_URL" -qc "
     reset role;
     insert into public.configs (owner_id, created_by, config)
     values ('$A','$A', '{\"version\":1,\"servers\":{\"x\":{\"transport\":\"http\",\"url\":\"https://x\",\"auth\":{\"type\":\"bearer\",\"token\":\"ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\"}}},\"profiles\":{}}');" >/dev/null 2>&1; then
  fail "a config carrying a raw token should have been rejected by the CHECK"
fi
echo "✓ raw secret value rejected (config stores references only)"

# A proper ${scheme:path} reference is accepted.
q "reset role;
   insert into public.configs (owner_id, created_by, config)
   values ('$A','$A', '{\"version\":1,\"servers\":{\"x\":{\"transport\":\"http\",\"url\":\"https://x\",\"auth\":{\"type\":\"bearer\",\"token\":\"\${env:GH_PAT}\"}}},\"profiles\":{}}');" >/dev/null
echo "✓ a reference (\${env:...}) is accepted"

# --- 4. Team config audit trail --------------------------------------------------------
TEAM='33333333-3333-3333-3333-333333333333'
q "reset role;
   insert into public.teams (id,name,owner_id) values ('$TEAM','acme','$A');
   insert into public.team_members (team_id,user_id,role) values ('$TEAM','$A','owner');
   insert into public.configs (owner_id, team_id, created_by, config)
     values ('$A','$TEAM','$A','{\"version\":1,\"servers\":{},\"profiles\":{}}');
   insert into public.configs (owner_id, team_id, created_by, config)
     values ('$A','$TEAM','$A','{\"version\":1,\"servers\":{\"s\":{\"transport\":\"stdio\",\"command\":\"x\"}},\"profiles\":{}}');" >/dev/null
versions=$(q "select count(*) from public.config_audit where team_id='$TEAM';")
[ "$versions" = "2" ] || fail "audit view should show 2 team config versions, saw $versions"
maxv=$(q "select max(version) from public.configs where team_id='$TEAM';")
[ "$maxv" = "2" ] || fail "team config should auto-version to 2, got $maxv"
echo "✓ team config history feeds config_audit (2 versions, auto-numbered)"

echo "✓ RLS + immutability + reference-only + audit all verified"
