-- 0001_init.sql (S6.1) — foundational bootstrap the rest of the schema (S6.2+) builds on.
--
-- Idempotent and safe on BOTH a plain `postgres:15` (CI integration) and a real
-- self-hosted Supabase instance (where the roles/extensions may already exist). It
-- creates nothing business-specific — tables land in S6.2.

-- The `extensions` schema exists on Supabase but not on a bare Postgres image; create it
-- first so the extensions below have somewhere to live.
create schema if not exists extensions;

-- Extensions used across the schema: gen_random_uuid(), crypt()/gen_salt(), etc.
create extension if not exists "pgcrypto" with schema extensions cascade;
create extension if not exists "uuid-ossp" with schema extensions cascade;

-- Supabase's standard roles. On a managed Supabase DB these already exist, so each is
-- guarded — this migration must be a no-op there, not an error.
do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

-- Let the API roles reach the public schema (RLS still gates every table in S6.2).
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;
