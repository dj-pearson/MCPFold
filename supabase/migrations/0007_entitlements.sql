-- 0007_entitlements.sql (S20.2) — Stripe-backed billing state that gates cloud team features.
--
-- Two tables:
--   public.entitlements   one row per team: its current tier + the Stripe subscription behind it.
--                         Written ONLY by the billing webhook (service_role / the side service's
--                         privileged connection, both BYPASSRLS). Readable by team members via RLS.
--   public.billing_events the idempotency ledger: each processed Stripe event id, so a re-delivered
--                         webhook is a primary-key conflict and never double-applies. Internal only.
--
-- Fail-closed: a team with no row resolves to the free tier in the app layer (lib/entitlements.ts),
-- so nothing here grants a paid tier by default.

create table public.entitlements (
  team_id uuid primary key references public.teams (id) on delete cascade,
  tier text not null default 'cloud-free'
    check (tier in ('cloud-free', 'team', 'enterprise')),
  status text,                       -- Stripe subscription status (active/trialing/past_due/…)
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

create table public.billing_events (
  event_id text primary key,         -- Stripe event id (evt_…) — the idempotency key
  type text not null,
  received_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------
-- RLS: entitlement rows are owner/team-readable only; nobody writes them via the API role.
-- (The webhook writes as the BYPASSRLS side-service / service_role connection.)
-- ---------------------------------------------------------------------------------------
alter table public.entitlements enable row level security;
alter table public.billing_events enable row level security;

-- A team member (or the owner) may READ their team's entitlement. No insert/update/delete policy
-- exists for the authenticated role, so RLS denies every client write.
create policy entitlements_member_select on public.entitlements for select
  using (
    public.is_team_member(team_id, auth.uid())
    or exists (select 1 from public.teams t where t.id = team_id and t.owner_id = auth.uid())
  );

-- billing_events has NO policy at all → the authenticated role can neither read nor write it.

-- ---------------------------------------------------------------------------------------
-- Grants — read-only for the API role; full access for the trusted server role.
-- ---------------------------------------------------------------------------------------
grant select on public.entitlements to authenticated;
grant all on public.entitlements, public.billing_events to service_role;
