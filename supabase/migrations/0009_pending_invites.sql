-- 0009_pending_invites.sql (S20.3) — pending team invites for people without an account yet,
-- a team audit-event log, and the auth.users → public.users provisioning trigger.
--
-- Before this, inviting an email with no account 404'd (teams/index.ts noted the flow as future).
-- Now the owner mints a single-use, expiring, 256-bit token (only its SHA-256 hash is stored); the
-- invitee redeems it after signing up. Redemption is authorized by the token hash and bound to the
-- **authenticated user id** — never to the email (which is non-unique), so a colliding email can
-- never auto-join a team (S20.3 anti-takeover rule).

-- ---------------------------------------------------------------------------------------
-- Provision a public.users mirror when GoTrue creates an auth.users row.
-- Was implicit before (done by hand in tests / on first sync); making it a trigger means a
-- freshly-signed-up user exists in public.users immediately, so invite redemption can bind to them.
-- ---------------------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------------------
-- Pending invites.
-- ---------------------------------------------------------------------------------------
create table if not exists public.pending_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  token_hash text not null unique, -- sha-256 hex of the 256-bit token; the raw token is never stored
  invited_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_by uuid references public.users (id),
  revoked_at timestamptz
);
create index if not exists pending_invites_team_idx on public.pending_invites (team_id);

-- ---------------------------------------------------------------------------------------
-- Team audit-event log (append-only): membership / invite / SSO events. Members read their team's
-- events; only the server (service_role) writes — deny-by-default for authenticated writes.
-- ---------------------------------------------------------------------------------------
create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  actor_id uuid references public.users (id),
  event text not null, -- e.g. invite.created / invite.redeemed / invite.revoked
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_events_team_idx on public.audit_events (team_id, created_at desc);

-- ---------------------------------------------------------------------------------------
-- Row-level security.
-- ---------------------------------------------------------------------------------------
alter table public.pending_invites enable row level security;
alter table public.audit_events enable row level security;

-- pending_invites: the team owner creates / lists / revokes (these run AS the owner). Redemption
-- runs server-side on the privileged connection (a token-hash lookup needs no team context), so no
-- authenticated policy covers reads-by-token — that path is deny-by-default here.
create policy pi_owner_select on public.pending_invites for select
  using (exists (select 1 from public.teams t where t.id = team_id and t.owner_id = auth.uid()));
create policy pi_owner_insert on public.pending_invites for insert
  with check (exists (select 1 from public.teams t where t.id = team_id and t.owner_id = auth.uid()));
create policy pi_owner_update on public.pending_invites for update
  using (exists (select 1 from public.teams t where t.id = team_id and t.owner_id = auth.uid()));

-- audit_events: members (and the owner) read; no authenticated write policy (server-only).
create policy ae_member_select on public.audit_events for select
  using (
    public.is_team_member(team_id, auth.uid())
    or exists (select 1 from public.teams t where t.id = team_id and t.owner_id = auth.uid())
  );

-- ---------------------------------------------------------------------------------------
-- Grants — RLS still gates every row.
-- ---------------------------------------------------------------------------------------
grant select, insert, update on public.pending_invites to authenticated;
grant select on public.audit_events to authenticated;
grant all on public.pending_invites, public.audit_events to service_role;
