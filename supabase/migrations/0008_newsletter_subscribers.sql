-- Newsletter / cloud-waitlist subscribers (S13.18).
--
-- The public /subscribe edge function is the ONLY writer, and it runs on the service connection
-- (which bypasses RLS), so RLS is enabled with NO policies: the anon/authenticated roles can neither
-- read nor write this table. We store no PII beyond the email itself; `status` supports a
-- double-opt-in flow (rows start `pending` until a confirmation link is clicked).
--
-- NOTE (merge): numbered 0008 off `main`; if another 0008_* migration lands first, renumber on merge.

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'unsubscribed')),
  -- Where the signup came from (e.g. 'home', 'pricing') — non-identifying, for basic attribution.
  source text,
  created_at timestamptz not null default now()
);

alter table public.newsletter_subscribers enable row level security;
-- Deliberately no policies: only the service role (the subscribe function) touches this table.

comment on table public.newsletter_subscribers is
  'Email newsletter / cloud-waitlist signups (S13.18). Written only by the public subscribe edge function on the service connection; no anon/authenticated access. No PII beyond email.';
