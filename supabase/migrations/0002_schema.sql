-- 0002_schema.sql (S6.2) — the cloud data model + row-level security.
--
-- Tables: users, teams, team_members, machines, configs (append-only, versioned, JSONB
-- canonical config holding secret REFERENCES only — never resolved values). RLS isolates
-- every row by owner / team membership. Portable across a real self-hosted Supabase (where
-- auth.users + auth.uid() already exist) and the plain-Postgres CI database (where this
-- migration provides compatible shims so RLS is testable without GoTrue).

-- ---------------------------------------------------------------------------------------
-- auth shims — no-ops on real Supabase, minimal stand-ins on bare Postgres (CI).
-- ---------------------------------------------------------------------------------------
create schema if not exists auth;

-- Supabase already has auth.users; on CI we create a minimal stand-in so the FK resolves.
create table if not exists auth.users (
  id uuid primary key,
  email text
);

-- Supabase already defines auth.uid() (reads the JWT `sub`). Only define a compatible
-- stand-in when it's absent (CI), reading a session GUC so tests can impersonate a user.
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'uid'
  ) then
    execute $f$
      create function auth.uid() returns uuid language sql stable as $b$
        select nullif(current_setting('app.current_user_id', true), '')::uuid
      $b$;
    $f$;
  end if;
end
$$;

-- ---------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table public.machines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

-- Guards that the canonical config JSONB carries only ${scheme:path} references, never a
-- resolved secret value. Defense-in-depth behind the CLI invariant (the client uploads
-- config, never secrets): rejects a raw token anywhere, and a non-reference auth.token.
create or replace function public.config_is_ref_only(cfg jsonb)
returns boolean language plpgsql immutable as $$
declare
  v jsonb;
  s text;
  tok text;
begin
  -- Any raw secret-looking token anywhere → reject.
  for v in select jsonb_array_elements(jsonb_path_query_array(cfg, '$.**'))
  loop
    if jsonb_typeof(v) = 'string' then
      s := v #>> '{}';
      if s ~ '(ghp_[A-Za-z0-9]{20,})|(github_pat_[A-Za-z0-9_]{20,})|(sk-[A-Za-z0-9]{20,})|(xox[baprs]-[A-Za-z0-9-]{10,})|(AKIA[0-9A-Z]{16})' then
        return false;
      end if;
    end if;
  end loop;
  -- Every server auth.token present must be a ${scheme:path} reference.
  for tok in select jsonb_path_query(cfg, '$.servers.*.auth.token') #>> '{}'
  loop
    if tok is not null and tok !~ '^\$\{[a-z0-9_-]+:.+\}$' then
      return false;
    end if;
  end loop;
  return true;
end
$$;

create table public.configs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users (id) on delete cascade,
  team_id uuid references public.teams (id) on delete cascade, -- null → personal config
  version integer not null default 0,
  config jsonb not null check (public.config_is_ref_only(config)),
  created_by uuid not null references public.users (id),
  created_at timestamptz not null default now()
);

-- One version number per config "line" (a team's config, or a user's personal config).
create unique index configs_line_version_uq
  on public.configs (coalesce(team_id, owner_id), version);
create index configs_owner_idx on public.configs (owner_id);
create index configs_team_idx on public.configs (team_id);

-- ---------------------------------------------------------------------------------------
-- Versioning + append-only immutability
-- ---------------------------------------------------------------------------------------
-- Assign the next version within the config line on insert (any supplied version ignored).
create or replace function public.configs_set_version()
returns trigger language plpgsql as $$
begin
  select coalesce(max(version), 0) + 1 into new.version
  from public.configs
  where coalesce(team_id, owner_id) = coalesce(new.team_id, new.owner_id);
  return new;
end
$$;
create trigger configs_version before insert on public.configs
  for each row execute function public.configs_set_version();

-- No in-place edits: a config version is immutable once written. New state = new row.
-- (DELETE is left to FK cascade on user/team removal; history is never rewritten.)
create or replace function public.configs_no_update()
returns trigger language plpgsql as $$
begin
  raise exception 'configs is append-only: insert a new version instead of updating (id=%)', old.id;
end
$$;
create trigger configs_immutable before update on public.configs
  for each row execute function public.configs_no_update();

-- ---------------------------------------------------------------------------------------
-- Audit view: who changed a team's config, and when.
-- ---------------------------------------------------------------------------------------
create view public.config_audit as
select
  c.team_id,
  c.id as config_id,
  c.version,
  c.created_by,
  u.email as changed_by_email,
  c.created_at as changed_at
from public.configs c
join public.users u on u.id = c.created_by
where c.team_id is not null;

-- ---------------------------------------------------------------------------------------
-- Membership helper (security definer → avoids RLS recursion when policies read
-- team_members). STABLE, pinned search_path.
-- ---------------------------------------------------------------------------------------
create or replace function public.is_team_member(p_team uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.team_members where team_id = p_team and user_id = p_user
  );
$$;

-- ---------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.machines enable row level security;
alter table public.configs enable row level security;

-- users: you see and manage only yourself.
create policy users_self_select on public.users for select using (id = auth.uid());
create policy users_self_insert on public.users for insert with check (id = auth.uid());
create policy users_self_update on public.users for update using (id = auth.uid());

-- teams: members can read; the owner can create and manage.
create policy teams_member_select on public.teams for select
  using (owner_id = auth.uid() or public.is_team_member(id, auth.uid()));
create policy teams_owner_insert on public.teams for insert with check (owner_id = auth.uid());
create policy teams_owner_update on public.teams for update using (owner_id = auth.uid());
create policy teams_owner_delete on public.teams for delete using (owner_id = auth.uid());

-- team_members: members can see the roster; the team owner manages it.
create policy tm_member_select on public.team_members for select
  using (public.is_team_member(team_id, auth.uid()));
create policy tm_owner_insert on public.team_members for insert
  with check (exists (select 1 from public.teams t where t.id = team_id and t.owner_id = auth.uid()));
create policy tm_owner_delete on public.team_members for delete
  using (exists (select 1 from public.teams t where t.id = team_id and t.owner_id = auth.uid()));

-- machines: yours only.
create policy machines_owner_all on public.machines for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- configs: your personal configs, plus configs of teams you belong to. No UPDATE policy
-- (immutability trigger + absence of a policy both forbid in-place edits).
create policy configs_select on public.configs for select
  using (
    (team_id is null and owner_id = auth.uid())
    or (team_id is not null and public.is_team_member(team_id, auth.uid()))
  );
create policy configs_insert on public.configs for insert
  with check (
    created_by = auth.uid()
    and (
      (team_id is null and owner_id = auth.uid())
      or (team_id is not null and public.is_team_member(team_id, auth.uid()))
    )
  );

-- ---------------------------------------------------------------------------------------
-- Grants — the API roles reach the tables; RLS (above) still gates every row.
-- ---------------------------------------------------------------------------------------
grant select, insert, update, delete on
  public.users, public.teams, public.team_members, public.machines, public.configs
  to authenticated;
grant select on public.config_audit to authenticated;
-- service_role is BYPASSRLS (server-side, trusted); give it full table access too.
grant all on
  public.users, public.teams, public.team_members, public.machines, public.configs
  to service_role;
grant select on public.config_audit to service_role;
