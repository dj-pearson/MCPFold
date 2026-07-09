-- directory.sql (S7.4, S15.4) — the curated MCP server directory, DB-backed mirror of
-- packages/core/src/directory.ts (the single source). GENERATED — do not hand-edit; run
-- `pnpm --filter @mcpfold/core gen:directory-seed` after changing DIRECTORY. Public, read-only
-- browse data (no secrets, no per-tenant rows), so it is world-readable. Self-contained +
-- idempotent: safe to re-run.

create table if not exists public.directory (
  id text primary key,
  name text not null,
  description text not null,
  transport text not null check (transport in ('stdio', 'streamable-http', 'sse')),
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

insert into public.directory (id, name, description, transport, command, args, url, token_ref, tags)
values
  ('filesystem', 'Filesystem', 'Read and write local files within allowed directories.', 'stdio', 'npx', array['-y', '@modelcontextprotocol/server-filesystem', '.'], null, null, array['files']),
  ('memory', 'Memory', 'A knowledge-graph memory the model can read and write across turns.', 'stdio', 'npx', array['-y', '@modelcontextprotocol/server-memory'], null, null, array['ai', 'memory']),
  ('sequential-thinking', 'Sequential Thinking', 'A tool for step-by-step reasoning and problem decomposition.', 'stdio', 'npx', array['-y', '@modelcontextprotocol/server-sequential-thinking'], null, null, array['ai']),
  ('everything', 'Everything', 'A reference server exercising every MCP feature — useful for testing clients.', 'stdio', 'npx', array['-y', '@modelcontextprotocol/server-everything'], null, null, array['dev-tools']),
  ('fetch', 'Fetch', 'Fetch a URL and convert the page to markdown for the model.', 'stdio', 'uvx', array['mcp-server-fetch'], null, null, array['web']),
  ('git', 'Git', 'Read, search, and manipulate a local Git repository.', 'stdio', 'uvx', array['mcp-server-git'], null, null, array['git', 'dev-tools']),
  ('time', 'Time', 'Time and timezone conversions.', 'stdio', 'uvx', array['mcp-server-time'], null, null, array['productivity']),
  ('sqlite', 'SQLite', 'Query and inspect a local SQLite database.', 'stdio', 'uvx', array['mcp-server-sqlite'], null, null, array['database']),
  ('github', 'GitHub', 'Repositories, issues, and pull requests via the GitHub API.', 'stdio', 'npx', array['-y', '@modelcontextprotocol/server-github'], null, '${env:GITHUB_PAT}', array['git', 'dev-tools']),
  ('gitlab', 'GitLab', 'Projects, issues, and merge requests via the GitLab API.', 'stdio', 'npx', array['-y', '@modelcontextprotocol/server-gitlab'], null, '${env:GITLAB_TOKEN}', array['git', 'dev-tools']),
  ('jetbrains', 'JetBrains', 'Talk to a running JetBrains IDE — files, refactors, and run configs.', 'stdio', 'npx', array['-y', '@jetbrains/mcp-proxy'], null, null, array['dev-tools']),
  ('code-runner', 'Code Runner', 'Run code snippets in many languages and return the output.', 'stdio', 'npx', array['-y', 'mcp-server-code-runner'], null, null, array['dev-tools']),
  ('e2b', 'E2B', 'Run code in a secure cloud sandbox.', 'stdio', 'npx', array['-y', '@e2b/mcp-server'], null, '${env:E2B_API_KEY}', array['dev-tools', 'cloud']),
  ('desktop-commander', 'Desktop Commander', 'Run terminal commands and edit files on your machine.', 'stdio', 'npx', array['-y', '@wonderwhy-er/desktop-commander'], null, null, array['dev-tools', 'files']),
  ('iterm', 'iTerm', 'Read and drive the active iTerm terminal session (macOS).', 'stdio', 'npx', array['-y', 'iterm-mcp'], null, null, array['dev-tools']),
  ('commands', 'Shell Commands', 'Run allow-listed shell commands and return their output.', 'stdio', 'npx', array['-y', 'mcp-server-commands'], null, null, array['dev-tools']),
  ('context7', 'Context7', 'Pull up-to-date, version-specific library docs into the model.', 'stdio', 'npx', array['-y', '@upstash/context7-mcp'], null, null, array['ai', 'dev-tools']),
  ('magic', '21st.dev Magic', 'Generate React UI components from a natural-language prompt.', 'stdio', 'npx', array['-y', '@21st-dev/magic'], null, '${env:TWENTYFIRST_API_KEY}', array['dev-tools', 'ai']),
  ('figma', 'Figma', 'Read Figma files and frames so an agent can implement the design.', 'stdio', 'npx', array['-y', 'figma-developer-mcp'], null, '${env:FIGMA_API_KEY}', array['dev-tools', 'media']),
  ('markitdown', 'MarkItDown', 'Convert PDFs, Office docs, and more to markdown.', 'stdio', 'uvx', array['markitdown-mcp'], null, null, array['files', 'dev-tools']),
  ('playwright', 'Playwright', 'Drive a real browser for navigation, scraping, and testing.', 'stdio', 'npx', array['-y', '@playwright/mcp'], null, null, array['browser', 'dev-tools']),
  ('puppeteer', 'Puppeteer', 'Browser automation and screenshots via Puppeteer.', 'stdio', 'npx', array['-y', '@modelcontextprotocol/server-puppeteer'], null, null, array['browser']),
  ('browserbase', 'Browserbase', 'Cloud headless browsers for automation at scale.', 'stdio', 'npx', array['-y', '@browserbasehq/mcp-server-browserbase'], null, '${env:BROWSERBASE_API_KEY}', array['browser', 'cloud']),
  ('apify', 'Apify', 'Run Apify Actors to scrape and automate the web.', 'stdio', 'npx', array['-y', '@apify/actors-mcp-server'], null, '${env:APIFY_TOKEN}', array['automation', 'web']),
  ('brave-search', 'Brave Search', 'Web and local search via the Brave Search API.', 'stdio', 'npx', array['-y', '@modelcontextprotocol/server-brave-search'], null, '${env:BRAVE_API_KEY}', array['search', 'web']),
  ('tavily', 'Tavily', 'Web search and extraction tuned for LLMs.', 'stdio', 'npx', array['-y', 'tavily-mcp'], null, '${env:TAVILY_API_KEY}', array['search', 'web']),
  ('exa', 'Exa', 'Neural web search and crawling for AI agents.', 'stdio', 'npx', array['-y', 'exa-mcp-server'], null, '${env:EXA_API_KEY}', array['search', 'web']),
  ('duckduckgo', 'DuckDuckGo', 'Web search via DuckDuckGo, no API key required.', 'stdio', 'npx', array['-y', 'duckduckgo-mcp-server'], null, null, array['search', 'web']),
  ('perplexity', 'Perplexity', 'Ask the Perplexity Sonar models for sourced answers.', 'stdio', 'npx', array['-y', 'server-perplexity-ask'], null, '${env:PERPLEXITY_API_KEY}', array['search', 'ai']),
  ('firecrawl', 'Firecrawl', 'Crawl, scrape, and search sites into clean markdown.', 'stdio', 'npx', array['-y', 'firecrawl-mcp'], null, '${env:FIRECRAWL_API_KEY}', array['web', 'search']),
  ('arxiv', 'arXiv', 'Search and fetch papers from arXiv.', 'stdio', 'npx', array['-y', 'arxiv-mcp-server'], null, null, array['search', 'ai']),
  ('postgres', 'Postgres', 'Read-only SQL queries against a Postgres database.', 'stdio', 'npx', array['-y', '@modelcontextprotocol/server-postgres'], null, '${env:DATABASE_URL}', array['database']),
  ('redis', 'Redis', 'Read and write keys in a Redis instance.', 'stdio', 'npx', array['-y', '@modelcontextprotocol/server-redis'], null, '${env:REDIS_URL}', array['database']),
  ('mongodb', 'MongoDB', 'Query and manage a MongoDB database.', 'stdio', 'npx', array['-y', 'mongodb-mcp-server'], null, '${env:MONGODB_URI}', array['database']),
  ('dbhub', 'DBHub', 'One SQL server for Postgres, MySQL, SQL Server, SQLite, and MariaDB.', 'stdio', 'npx', array['-y', '@bytebase/dbhub'], null, '${env:DSN}', array['database']),
  ('supabase', 'Supabase', 'Manage a Supabase project — tables, SQL, and edge config.', 'stdio', 'npx', array['-y', '@supabase/mcp-server-supabase'], null, '${env:SUPABASE_ACCESS_TOKEN}', array['database', 'cloud']),
  ('neon', 'Neon', 'Manage Neon serverless Postgres projects and run SQL.', 'stdio', 'npx', array['-y', '@neondatabase/mcp-server-neon'], null, '${env:NEON_API_KEY}', array['database', 'cloud']),
  ('airtable', 'Airtable', 'Read and write Airtable bases and records.', 'stdio', 'npx', array['-y', 'airtable-mcp-server'], null, '${env:AIRTABLE_API_KEY}', array['database', 'productivity']),
  ('elasticsearch', 'Elasticsearch', 'Search and inspect Elasticsearch indices.', 'stdio', 'npx', array['-y', '@elastic/mcp-server-elasticsearch'], null, '${env:ELASTICSEARCH_API_KEY}', array['database', 'search']),
  ('clickhouse', 'ClickHouse', 'Run analytical SQL against a ClickHouse database.', 'stdio', 'uvx', array['mcp-clickhouse'], null, '${env:CLICKHOUSE_PASSWORD}', array['database', 'data']),
  ('pinecone', 'Pinecone', 'Query and manage Pinecone vector indexes.', 'stdio', 'npx', array['-y', '@pinecone-database/mcp'], null, '${env:PINECONE_API_KEY}', array['database', 'ai']),
  ('qdrant', 'Qdrant', 'Store and retrieve vectors from a Qdrant database.', 'stdio', 'uvx', array['mcp-server-qdrant'], null, '${env:QDRANT_API_KEY}', array['database', 'ai']),
  ('chart', 'Charts', 'Generate charts and graphs from data (AntV).', 'stdio', 'npx', array['-y', '@antv/mcp-server-chart'], null, null, array['data', 'media']),
  ('aws-kb-retrieval', 'AWS Knowledge Base', 'Retrieve from an AWS Bedrock knowledge base.', 'stdio', 'npx', array['-y', '@modelcontextprotocol/server-aws-kb-retrieval'], null, '${env:AWS_ACCESS_KEY_ID}', array['cloud', 'ai']),
  ('cloudflare', 'Cloudflare', 'Manage Cloudflare Workers, KV, R2, and DNS.', 'stdio', 'npx', array['-y', '@cloudflare/mcp-server-cloudflare'], null, '${env:CLOUDFLARE_API_TOKEN}', array['cloud']),
  ('heroku', 'Heroku', 'Manage Heroku apps, dynos, and add-ons.', 'stdio', 'npx', array['-y', '@heroku/mcp-server'], null, '${env:HEROKU_API_KEY}', array['cloud']),
  ('azure', 'Azure', 'Query and manage Azure resources.', 'stdio', 'npx', array['-y', '@azure/mcp'], null, null, array['cloud']),
  ('kubernetes', 'Kubernetes', 'Inspect and operate a Kubernetes cluster via kubectl.', 'stdio', 'npx', array['-y', 'mcp-server-kubernetes'], null, null, array['cloud', 'dev-tools']),
  ('notion', 'Notion', 'Read and update Notion pages and databases.', 'stdio', 'npx', array['-y', '@notionhq/notion-mcp-server'], null, '${env:NOTION_TOKEN}', array['productivity']),
  ('obsidian', 'Obsidian', 'Read and search an Obsidian vault.', 'stdio', 'npx', array['-y', 'mcp-obsidian'], null, null, array['productivity', 'files']),
  ('linear', 'Linear', 'Manage Linear issues, projects, and cycles.', 'stdio', 'npx', array['-y', 'mcp-linear'], null, '${env:LINEAR_API_KEY}', array['productivity']),
  ('clickup', 'ClickUp', 'Manage ClickUp tasks, lists, and docs.', 'stdio', 'npx', array['-y', 'mcp-clickup'], null, '${env:CLICKUP_API_KEY}', array['productivity']),
  ('trello', 'Trello', 'Manage Trello boards, lists, and cards.', 'stdio', 'npx', array['-y', 'mcp-trello'], null, '${env:TRELLO_API_KEY}', array['productivity']),
  ('atlassian', 'Atlassian', 'Jira issues and Confluence pages.', 'stdio', 'uvx', array['mcp-atlassian'], null, '${env:ATLASSIAN_API_TOKEN}', array['productivity']),
  ('gdrive', 'Google Drive', 'Search and read files in Google Drive.', 'stdio', 'npx', array['-y', '@modelcontextprotocol/server-gdrive'], null, null, array['files', 'productivity']),
  ('gmail', 'Gmail', 'Read, search, and send Gmail messages.', 'stdio', 'npx', array['-y', '@gongrzhe/server-gmail-autoauth-mcp'], null, null, array['communication', 'productivity']),
  ('slack', 'Slack', 'Post and read messages in Slack channels.', 'stdio', 'npx', array['-y', '@modelcontextprotocol/server-slack'], null, '${env:SLACK_BOT_TOKEN}', array['communication']),
  ('discord', 'Discord', 'Send and read messages in Discord servers.', 'stdio', 'npx', array['-y', 'discord-mcp'], null, '${env:DISCORD_TOKEN}', array['communication']),
  ('twilio', 'Twilio', 'Send SMS and use the Twilio APIs.', 'stdio', 'npx', array['-y', '@twilio-alpha/mcp'], null, '${env:TWILIO_AUTH_TOKEN}', array['communication']),
  ('everart', 'EverArt', 'Generate images with the EverArt API.', 'stdio', 'npx', array['-y', '@modelcontextprotocol/server-everart'], null, '${env:EVERART_API_KEY}', array['media', 'ai']),
  ('spotify', 'Spotify', 'Control playback and manage playlists via the Spotify API.', 'stdio', 'npx', array['-y', 'spotify-mcp'], null, '${env:SPOTIFY_CLIENT_ID}', array['media']),
  ('youtube-transcript', 'YouTube Transcript', 'Fetch transcripts for YouTube videos.', 'stdio', 'npx', array['-y', 'youtube-transcript-mcp'], null, null, array['media']),
  ('google-maps', 'Google Maps', 'Geocoding, directions, and places via Google Maps.', 'stdio', 'npx', array['-y', '@modelcontextprotocol/server-google-maps'], null, '${env:GOOGLE_MAPS_API_KEY}', array['maps']),
  ('amap', 'Amap', 'Chinese maps, geocoding, and routing via Amap.', 'stdio', 'npx', array['-y', '@amap/amap-maps-mcp-server'], null, '${env:AMAP_MAPS_API_KEY}', array['maps']),
  ('baidu-map', 'Baidu Maps', 'Chinese maps, geocoding, and routing via Baidu.', 'stdio', 'npx', array['-y', '@baidumap/mcp-server-baidu-map'], null, '${env:BAIDU_MAP_API_KEY}', array['maps']),
  ('sentry', 'Sentry', 'Retrieve and triage Sentry issues.', 'stdio', 'npx', array['-y', '@sentry/mcp-server'], null, '${env:SENTRY_AUTH_TOKEN}', array['monitoring', 'dev-tools']),
  ('stripe', 'Stripe', 'Query and manage Stripe payments and customers.', 'stdio', 'npx', array['-y', '@stripe/mcp'], null, '${env:STRIPE_SECRET_KEY}', array['finance']),
  ('hubspot', 'HubSpot', 'Read and update HubSpot CRM records.', 'stdio', 'npx', array['-y', '@hubspot/mcp-server'], null, '${env:HUBSPOT_ACCESS_TOKEN}', array['crm']),
  ('shopify', 'Shopify', 'Query the Shopify Dev APIs and docs.', 'stdio', 'npx', array['-y', '@shopify/dev-mcp'], null, null, array['crm', 'dev-tools']),
  ('airbnb', 'Airbnb', 'Search Airbnb listings and details.', 'stdio', 'npx', array['-y', '@openbnb/mcp-server-airbnb'], null, null, array['web'])
on conflict (id) do nothing;
