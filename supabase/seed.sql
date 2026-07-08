-- seed.sql (S6.1) — local/dev seed data, applied by `supabase db reset` and by
-- ./scripts/migrate.sh when SEED=1. Intentionally minimal until S6.2 defines tables;
-- NEVER put real user data or secrets here (this file is committed).

-- Example (uncomment once S6.2 lands the tables):
-- insert into public.users (id, email) values
--   ('00000000-0000-0000-0000-000000000001', 'dev@example.test')
-- on conflict do nothing;
