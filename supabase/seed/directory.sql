-- directory.sql (S7.4) — the curated MCP server directory, DB-backed mirror of
-- apps/web/src/directory/seed.ts. Public, read-only browse data (no secrets, no per-tenant
-- rows), so it is world-readable. Self-contained + idempotent: safe to re-run.
--
-- To add a server: append an INSERT below (unique id, neutral description, ref-only token
-- placeholder) AND the matching entry in the web seed. Keep copy factual — no endorsement.

create table if not exists public.directory (
  id text primary key,
  name text not null,
  description text not null,
  transport text not null check (transport in ('stdio', 'http', 'sse')),
  command text,
  args text[],
  url text,
  token_ref text, -- a ${scheme:path} placeholder if the server needs auth; never a value
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Public browse: anyone may read the directory; nobody but service_role may write it.
alter table public.directory enable row level security;
drop policy if exists directory_public_read on public.directory;
create policy directory_public_read on public.directory for select using (true);
grant select on public.directory to anon, authenticated;
grant all on public.directory to service_role;

insert into public.directory (id, name, description, transport, command, args, token_ref, tags)
values
  ('filesystem', 'Filesystem', 'Read and write local files within allowed directories.',
   'stdio', 'npx', array['-y', '@modelcontextprotocol/server-filesystem', '.'], null, array['files']),
  ('github', 'GitHub', 'Repositories, issues, and pull requests via the GitHub API.',
   'stdio', 'npx', array['-y', '@modelcontextprotocol/server-github'], '${env:GITHUB_PAT}', array['git', 'work']),
  ('fetch', 'Fetch', 'Fetch and convert web pages to markdown for the model.',
   'stdio', 'npx', array['-y', '@modelcontextprotocol/server-fetch'], null, array['web']),
  ('postgres', 'Postgres', 'Read-only SQL queries against a Postgres database.',
   'stdio', 'npx', array['-y', '@modelcontextprotocol/server-postgres'], '${env:DATABASE_URL}', array['db']),
  ('playwright', 'Playwright', 'Drive a browser for scraping and end-to-end testing.',
   'stdio', 'npx', array['-y', '@playwright/mcp@latest'], null, array['browser', 'code'])
on conflict (id) do nothing;
