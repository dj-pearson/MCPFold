-- 0003_device_codes.sql (S6.3) — device-code OAuth support for `mcpfold login`.
--
-- Two server-managed tables backing the RFC 8628-style device flow:
--   device_codes — the short-lived pending/approved authorization requests.
--   sessions     — issued refresh tokens (rotation + reuse-detection hardened in S9.5).
--
-- Neither is reached directly by an unauthenticated client: the auth edge function
-- (services/edge) owns all reads/writes using a privileged connection. RLS is therefore
-- ENABLED with no permissive policies for authenticated/anon (deny-by-default); only
-- service_role (BYPASSRLS) and the trusted DB owner touch these rows. We store only HASHES
-- of the high-entropy device_code and refresh_token — never the raw secret values.

-- ---------------------------------------------------------------------------------------
-- device_codes — one row per `mcpfold login` attempt.
-- ---------------------------------------------------------------------------------------
create table public.device_codes (
  id uuid primary key default gen_random_uuid(),
  -- sha-256 hex of the raw device_code the CLI polls with (secret; never stored raw).
  device_code_hash text not null unique,
  -- short human code the user types in the browser (e.g. WDJB-MJHT); low-entropy but
  -- short-lived and single-use, so it is safe to store and index directly.
  user_code text not null unique,
  status text not null default 'pending' check (status in ('pending', 'approved', 'claimed', 'expired')),
  -- null until a signed-in user approves the request in the browser.
  user_id uuid references public.users (id) on delete cascade,
  machine_name text,
  interval_seconds integer not null default 5,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  approved_at timestamptz,
  claimed_at timestamptz,
  last_polled_at timestamptz
);
create index device_codes_expires_idx on public.device_codes (expires_at);

-- ---------------------------------------------------------------------------------------
-- sessions — the refresh tokens issued when a device code is claimed. The access token is
-- a stateless HS256 JWT (not stored); only the refresh token is tracked here so it can be
-- rotated/revoked. Per-machine revocation (S9.5 / S7.5) reads this table.
-- ---------------------------------------------------------------------------------------
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  -- sha-256 hex of the raw refresh token (secret; never stored raw).
  refresh_token_hash text not null unique,
  machine_name text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz
);
create index sessions_user_idx on public.sessions (user_id);

-- ---------------------------------------------------------------------------------------
-- RLS: deny-by-default. No policies are created for authenticated/anon, so those roles see
-- zero rows. The edge function uses service_role (BYPASSRLS) — granted below.
-- ---------------------------------------------------------------------------------------
alter table public.device_codes enable row level security;
alter table public.sessions enable row level security;

grant all on public.device_codes, public.sessions to service_role;
