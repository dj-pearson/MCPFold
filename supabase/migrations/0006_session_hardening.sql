-- 0006_session_hardening.sql (S9.5) — refresh-token rotation + reuse detection.
--
-- Each session belongs to a `family` (the chain of rotated refresh tokens from one login). On
-- refresh the presented token is rotated: it's marked `rotated_at` and a new token is issued in
-- the same family. If an already-rotated (used) token is presented again — a sign it was stolen
-- and replayed — the WHOLE family is revoked. Per-machine revocation sets `revoked_at`.
alter table public.sessions add column if not exists family_id uuid;
alter table public.sessions add column if not exists rotated_at timestamptz;

create index if not exists sessions_family_idx on public.sessions (family_id);
