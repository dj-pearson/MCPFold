-- 0005_machine_sync.sql (S7.5) — per-machine sync status.
--
-- `push` registers the pushing machine (name from the request) and records the version it last
-- pushed + when it was last seen. The sync dashboard reads this (RLS-scoped) to show each
-- machine's status and flag any that are behind the latest version.
alter table public.machines
  add column if not exists last_pushed_version integer;

-- Upsert key: one row per (user, machine name).
create unique index if not exists machines_user_name_uq on public.machines (user_id, name);
