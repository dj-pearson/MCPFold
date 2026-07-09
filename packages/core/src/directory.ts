import type { Transport } from './types.js';

/**
 * Curated MCP server directory (S7.4, expanded in S15.4) — the single source shared by the web
 * app's directory and the public SEO directory + collection pages on the marketing site (S13.5,
 * S15.4). A neutral, community-maintained list; mcpfold is not affiliated with or endorsed by these
 * projects or the MCP project. Entries prefill a valid, ref-only server entry (tokens are
 * `${provider:path}` placeholders, never values). Every package here was verified to exist on
 * npm/PyPI before listing.
 *
 * SINGLE SOURCE + MIRROR. This array is the source of truth. The DB seed
 * (`supabase/seed/directory.sql`) is generated from it by `directorySeedSql()` — do not hand-edit
 * the SQL; run `pnpm --filter @mcpfold/core gen:directory-seed` after changing entries. A test
 * (`directory.test.ts`) fails if the committed SQL ever drifts from this array.
 *
 * TO ADD OR RECATEGORIZE A SERVER: append an entry with a unique `id`, a neutral one-line
 * description, its transport + launch (`command`/`args` for stdio, `url` for http/sse), an
 * optional `tokenRef` placeholder if it needs auth, and one or more `suggestedTags` from the
 * vocabulary in CATEGORY_META. Keep copy factual — no endorsement language. Then regenerate the
 * seed. A tag earns its own indexable /directory/category/<tag> page only once
 * MIN_CATEGORY_ENTRIES distinct servers carry it (thin-page / index-bloat guard, S15.4).
 */

export interface DirectoryEntry {
  id: string;
  name: string;
  description: string;
  transport: Transport;
  command?: string;
  args?: string[];
  url?: string;
  /** A `${provider:path}` placeholder if the server needs a token (never a real value). */
  tokenRef?: string;
  suggestedTags: string[];
}

/** Bumped when the curated set changes materially (S15.4: expanded 5 → 70). */
export const DIRECTORY_VERSION = 2;

export const DIRECTORY: DirectoryEntry[] = [
  {
    id: 'filesystem',
    name: 'Filesystem',
    description: 'Read and write local files within allowed directories.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
    suggestedTags: ['files'],
  },
  {
    id: 'memory',
    name: 'Memory',
    description: 'A knowledge-graph memory the model can read and write across turns.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    suggestedTags: ['ai', 'memory'],
  },
  {
    id: 'sequential-thinking',
    name: 'Sequential Thinking',
    description: 'A tool for step-by-step reasoning and problem decomposition.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    suggestedTags: ['ai'],
  },
  {
    id: 'everything',
    name: 'Everything',
    description: 'A reference server exercising every MCP feature — useful for testing clients.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-everything'],
    suggestedTags: ['dev-tools'],
  },
  {
    id: 'fetch',
    name: 'Fetch',
    description: 'Fetch a URL and convert the page to markdown for the model.',
    transport: 'stdio',
    command: 'uvx',
    args: ['mcp-server-fetch'],
    suggestedTags: ['web'],
  },
  {
    id: 'git',
    name: 'Git',
    description: 'Read, search, and manipulate a local Git repository.',
    transport: 'stdio',
    command: 'uvx',
    args: ['mcp-server-git'],
    suggestedTags: ['git', 'dev-tools'],
  },
  {
    id: 'time',
    name: 'Time',
    description: 'Time and timezone conversions.',
    transport: 'stdio',
    command: 'uvx',
    args: ['mcp-server-time'],
    suggestedTags: ['productivity'],
  },
  {
    id: 'sqlite',
    name: 'SQLite',
    description: 'Query and inspect a local SQLite database.',
    transport: 'stdio',
    command: 'uvx',
    args: ['mcp-server-sqlite'],
    suggestedTags: ['database'],
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Repositories, issues, and pull requests via the GitHub API.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    tokenRef: '${env:GITHUB_PAT}',
    suggestedTags: ['git', 'dev-tools'],
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    description: 'Projects, issues, and merge requests via the GitLab API.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-gitlab'],
    tokenRef: '${env:GITLAB_TOKEN}',
    suggestedTags: ['git', 'dev-tools'],
  },
  {
    id: 'jetbrains',
    name: 'JetBrains',
    description: 'Talk to a running JetBrains IDE — files, refactors, and run configs.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@jetbrains/mcp-proxy'],
    suggestedTags: ['dev-tools'],
  },
  {
    id: 'code-runner',
    name: 'Code Runner',
    description: 'Run code snippets in many languages and return the output.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'mcp-server-code-runner'],
    suggestedTags: ['dev-tools'],
  },
  {
    id: 'e2b',
    name: 'E2B',
    description: 'Run code in a secure cloud sandbox.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@e2b/mcp-server'],
    tokenRef: '${env:E2B_API_KEY}',
    suggestedTags: ['dev-tools', 'cloud'],
  },
  {
    id: 'desktop-commander',
    name: 'Desktop Commander',
    description: 'Run terminal commands and edit files on your machine.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@wonderwhy-er/desktop-commander'],
    suggestedTags: ['dev-tools', 'files'],
  },
  {
    id: 'iterm',
    name: 'iTerm',
    description: 'Read and drive the active iTerm terminal session (macOS).',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'iterm-mcp'],
    suggestedTags: ['dev-tools'],
  },
  {
    id: 'commands',
    name: 'Shell Commands',
    description: 'Run allow-listed shell commands and return their output.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'mcp-server-commands'],
    suggestedTags: ['dev-tools'],
  },
  {
    id: 'context7',
    name: 'Context7',
    description: 'Pull up-to-date, version-specific library docs into the model.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@upstash/context7-mcp'],
    suggestedTags: ['ai', 'dev-tools'],
  },
  {
    id: 'magic',
    name: '21st.dev Magic',
    description: 'Generate React UI components from a natural-language prompt.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@21st-dev/magic'],
    tokenRef: '${env:TWENTYFIRST_API_KEY}',
    suggestedTags: ['dev-tools', 'ai'],
  },
  {
    id: 'figma',
    name: 'Figma',
    description: 'Read Figma files and frames so an agent can implement the design.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'figma-developer-mcp'],
    tokenRef: '${env:FIGMA_API_KEY}',
    suggestedTags: ['dev-tools', 'media'],
  },
  {
    id: 'markitdown',
    name: 'MarkItDown',
    description: 'Convert PDFs, Office docs, and more to markdown.',
    transport: 'stdio',
    command: 'uvx',
    args: ['markitdown-mcp'],
    suggestedTags: ['files', 'dev-tools'],
  },
  {
    id: 'playwright',
    name: 'Playwright',
    description: 'Drive a real browser for navigation, scraping, and testing.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@playwright/mcp'],
    suggestedTags: ['browser', 'dev-tools'],
  },
  {
    id: 'puppeteer',
    name: 'Puppeteer',
    description: 'Browser automation and screenshots via Puppeteer.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    suggestedTags: ['browser'],
  },
  {
    id: 'browserbase',
    name: 'Browserbase',
    description: 'Cloud headless browsers for automation at scale.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@browserbasehq/mcp-server-browserbase'],
    tokenRef: '${env:BROWSERBASE_API_KEY}',
    suggestedTags: ['browser', 'cloud'],
  },
  {
    id: 'apify',
    name: 'Apify',
    description: 'Run Apify Actors to scrape and automate the web.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@apify/actors-mcp-server'],
    tokenRef: '${env:APIFY_TOKEN}',
    suggestedTags: ['automation', 'web'],
  },
  {
    id: 'brave-search',
    name: 'Brave Search',
    description: 'Web and local search via the Brave Search API.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    tokenRef: '${env:BRAVE_API_KEY}',
    suggestedTags: ['search', 'web'],
  },
  {
    id: 'tavily',
    name: 'Tavily',
    description: 'Web search and extraction tuned for LLMs.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'tavily-mcp'],
    tokenRef: '${env:TAVILY_API_KEY}',
    suggestedTags: ['search', 'web'],
  },
  {
    id: 'exa',
    name: 'Exa',
    description: 'Neural web search and crawling for AI agents.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'exa-mcp-server'],
    tokenRef: '${env:EXA_API_KEY}',
    suggestedTags: ['search', 'web'],
  },
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    description: 'Web search via DuckDuckGo, no API key required.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'duckduckgo-mcp-server'],
    suggestedTags: ['search', 'web'],
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    description: 'Ask the Perplexity Sonar models for sourced answers.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'server-perplexity-ask'],
    tokenRef: '${env:PERPLEXITY_API_KEY}',
    suggestedTags: ['search', 'ai'],
  },
  {
    id: 'firecrawl',
    name: 'Firecrawl',
    description: 'Crawl, scrape, and search sites into clean markdown.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'firecrawl-mcp'],
    tokenRef: '${env:FIRECRAWL_API_KEY}',
    suggestedTags: ['web', 'search'],
  },
  {
    id: 'arxiv',
    name: 'arXiv',
    description: 'Search and fetch papers from arXiv.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'arxiv-mcp-server'],
    suggestedTags: ['search', 'ai'],
  },
  {
    id: 'postgres',
    name: 'Postgres',
    description: 'Read-only SQL queries against a Postgres database.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres'],
    tokenRef: '${env:DATABASE_URL}',
    suggestedTags: ['database'],
  },
  {
    id: 'redis',
    name: 'Redis',
    description: 'Read and write keys in a Redis instance.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-redis'],
    tokenRef: '${env:REDIS_URL}',
    suggestedTags: ['database'],
  },
  {
    id: 'mongodb',
    name: 'MongoDB',
    description: 'Query and manage a MongoDB database.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'mongodb-mcp-server'],
    tokenRef: '${env:MONGODB_URI}',
    suggestedTags: ['database'],
  },
  {
    id: 'dbhub',
    name: 'DBHub',
    description: 'One SQL server for Postgres, MySQL, SQL Server, SQLite, and MariaDB.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@bytebase/dbhub'],
    tokenRef: '${env:DSN}',
    suggestedTags: ['database'],
  },
  {
    id: 'supabase',
    name: 'Supabase',
    description: 'Manage a Supabase project — tables, SQL, and edge config.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@supabase/mcp-server-supabase'],
    tokenRef: '${env:SUPABASE_ACCESS_TOKEN}',
    suggestedTags: ['database', 'cloud'],
  },
  {
    id: 'neon',
    name: 'Neon',
    description: 'Manage Neon serverless Postgres projects and run SQL.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@neondatabase/mcp-server-neon'],
    tokenRef: '${env:NEON_API_KEY}',
    suggestedTags: ['database', 'cloud'],
  },
  {
    id: 'airtable',
    name: 'Airtable',
    description: 'Read and write Airtable bases and records.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'airtable-mcp-server'],
    tokenRef: '${env:AIRTABLE_API_KEY}',
    suggestedTags: ['database', 'productivity'],
  },
  {
    id: 'elasticsearch',
    name: 'Elasticsearch',
    description: 'Search and inspect Elasticsearch indices.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@elastic/mcp-server-elasticsearch'],
    tokenRef: '${env:ELASTICSEARCH_API_KEY}',
    suggestedTags: ['database', 'search'],
  },
  {
    id: 'clickhouse',
    name: 'ClickHouse',
    description: 'Run analytical SQL against a ClickHouse database.',
    transport: 'stdio',
    command: 'uvx',
    args: ['mcp-clickhouse'],
    tokenRef: '${env:CLICKHOUSE_PASSWORD}',
    suggestedTags: ['database', 'data'],
  },
  {
    id: 'pinecone',
    name: 'Pinecone',
    description: 'Query and manage Pinecone vector indexes.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@pinecone-database/mcp'],
    tokenRef: '${env:PINECONE_API_KEY}',
    suggestedTags: ['database', 'ai'],
  },
  {
    id: 'qdrant',
    name: 'Qdrant',
    description: 'Store and retrieve vectors from a Qdrant database.',
    transport: 'stdio',
    command: 'uvx',
    args: ['mcp-server-qdrant'],
    tokenRef: '${env:QDRANT_API_KEY}',
    suggestedTags: ['database', 'ai'],
  },
  {
    id: 'chart',
    name: 'Charts',
    description: 'Generate charts and graphs from data (AntV).',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@antv/mcp-server-chart'],
    suggestedTags: ['data', 'media'],
  },
  {
    id: 'aws-kb-retrieval',
    name: 'AWS Knowledge Base',
    description: 'Retrieve from an AWS Bedrock knowledge base.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-aws-kb-retrieval'],
    tokenRef: '${env:AWS_ACCESS_KEY_ID}',
    suggestedTags: ['cloud', 'ai'],
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    description: 'Manage Cloudflare Workers, KV, R2, and DNS.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@cloudflare/mcp-server-cloudflare'],
    tokenRef: '${env:CLOUDFLARE_API_TOKEN}',
    suggestedTags: ['cloud'],
  },
  {
    id: 'heroku',
    name: 'Heroku',
    description: 'Manage Heroku apps, dynos, and add-ons.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@heroku/mcp-server'],
    tokenRef: '${env:HEROKU_API_KEY}',
    suggestedTags: ['cloud'],
  },
  {
    id: 'azure',
    name: 'Azure',
    description: 'Query and manage Azure resources.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@azure/mcp'],
    suggestedTags: ['cloud'],
  },
  {
    id: 'kubernetes',
    name: 'Kubernetes',
    description: 'Inspect and operate a Kubernetes cluster via kubectl.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'mcp-server-kubernetes'],
    suggestedTags: ['cloud', 'dev-tools'],
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Read and update Notion pages and databases.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@notionhq/notion-mcp-server'],
    tokenRef: '${env:NOTION_TOKEN}',
    suggestedTags: ['productivity'],
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    description: 'Read and search an Obsidian vault.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'mcp-obsidian'],
    suggestedTags: ['productivity', 'files'],
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Manage Linear issues, projects, and cycles.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'mcp-linear'],
    tokenRef: '${env:LINEAR_API_KEY}',
    suggestedTags: ['productivity'],
  },
  {
    id: 'clickup',
    name: 'ClickUp',
    description: 'Manage ClickUp tasks, lists, and docs.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'mcp-clickup'],
    tokenRef: '${env:CLICKUP_API_KEY}',
    suggestedTags: ['productivity'],
  },
  {
    id: 'trello',
    name: 'Trello',
    description: 'Manage Trello boards, lists, and cards.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'mcp-trello'],
    tokenRef: '${env:TRELLO_API_KEY}',
    suggestedTags: ['productivity'],
  },
  {
    id: 'atlassian',
    name: 'Atlassian',
    description: 'Jira issues and Confluence pages.',
    transport: 'stdio',
    command: 'uvx',
    args: ['mcp-atlassian'],
    tokenRef: '${env:ATLASSIAN_API_TOKEN}',
    suggestedTags: ['productivity'],
  },
  {
    id: 'gdrive',
    name: 'Google Drive',
    description: 'Search and read files in Google Drive.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-gdrive'],
    suggestedTags: ['files', 'productivity'],
  },
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Read, search, and send Gmail messages.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@gongrzhe/server-gmail-autoauth-mcp'],
    suggestedTags: ['communication', 'productivity'],
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Post and read messages in Slack channels.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-slack'],
    tokenRef: '${env:SLACK_BOT_TOKEN}',
    suggestedTags: ['communication'],
  },
  {
    id: 'discord',
    name: 'Discord',
    description: 'Send and read messages in Discord servers.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'discord-mcp'],
    tokenRef: '${env:DISCORD_TOKEN}',
    suggestedTags: ['communication'],
  },
  {
    id: 'twilio',
    name: 'Twilio',
    description: 'Send SMS and use the Twilio APIs.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@twilio-alpha/mcp'],
    tokenRef: '${env:TWILIO_AUTH_TOKEN}',
    suggestedTags: ['communication'],
  },
  {
    id: 'everart',
    name: 'EverArt',
    description: 'Generate images with the EverArt API.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-everart'],
    tokenRef: '${env:EVERART_API_KEY}',
    suggestedTags: ['media', 'ai'],
  },
  {
    id: 'spotify',
    name: 'Spotify',
    description: 'Control playback and manage playlists via the Spotify API.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'spotify-mcp'],
    tokenRef: '${env:SPOTIFY_CLIENT_ID}',
    suggestedTags: ['media'],
  },
  {
    id: 'youtube-transcript',
    name: 'YouTube Transcript',
    description: 'Fetch transcripts for YouTube videos.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'youtube-transcript-mcp'],
    suggestedTags: ['media'],
  },
  {
    id: 'google-maps',
    name: 'Google Maps',
    description: 'Geocoding, directions, and places via Google Maps.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-google-maps'],
    tokenRef: '${env:GOOGLE_MAPS_API_KEY}',
    suggestedTags: ['maps'],
  },
  {
    id: 'amap',
    name: 'Amap',
    description: 'Chinese maps, geocoding, and routing via Amap.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@amap/amap-maps-mcp-server'],
    tokenRef: '${env:AMAP_MAPS_API_KEY}',
    suggestedTags: ['maps'],
  },
  {
    id: 'baidu-map',
    name: 'Baidu Maps',
    description: 'Chinese maps, geocoding, and routing via Baidu.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@baidumap/mcp-server-baidu-map'],
    tokenRef: '${env:BAIDU_MAP_API_KEY}',
    suggestedTags: ['maps'],
  },
  {
    id: 'sentry',
    name: 'Sentry',
    description: 'Retrieve and triage Sentry issues.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@sentry/mcp-server'],
    tokenRef: '${env:SENTRY_AUTH_TOKEN}',
    suggestedTags: ['monitoring', 'dev-tools'],
  },
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Query and manage Stripe payments and customers.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@stripe/mcp'],
    tokenRef: '${env:STRIPE_SECRET_KEY}',
    suggestedTags: ['finance'],
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    description: 'Read and update HubSpot CRM records.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@hubspot/mcp-server'],
    tokenRef: '${env:HUBSPOT_ACCESS_TOKEN}',
    suggestedTags: ['crm'],
  },
  {
    id: 'shopify',
    name: 'Shopify',
    description: 'Query the Shopify Dev APIs and docs.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@shopify/dev-mcp'],
    suggestedTags: ['crm', 'dev-tools'],
  },
  {
    id: 'airbnb',
    name: 'Airbnb',
    description: 'Search Airbnb listings and details.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@openbnb/mcp-server-airbnb'],
    suggestedTags: ['web'],
  },
];

/** Case-insensitive search over name, description, and tags. */
export function searchDirectory(query: string): DirectoryEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return DIRECTORY;
  return DIRECTORY.filter(
    (e) =>
      e.name.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.suggestedTags.some((t) => t.toLowerCase().includes(q)),
  );
}

// ------------------------------------------------------------------------------------------------
// Categories / collection pages (S15.4)
// ------------------------------------------------------------------------------------------------

export interface DirectoryCategory {
  /** The tag this category collects (also its URL slug). */
  id: string;
  label: string;
  description: string;
}

/**
 * A tag earns its own indexable collection page only once this many distinct servers carry it.
 * Below the threshold the tag still labels its servers but gets no standalone page — avoiding
 * thin / near-duplicate pages that dilute the directory (index-bloat guard).
 */
export const MIN_CATEGORY_ENTRIES = 3;

/** Human label + description for each tag in the controlled vocabulary. */
export const CATEGORY_META: Record<string, { label: string; description: string }> = {
  files: {
    label: 'File & document',
    description: 'MCP servers that read, write, and convert local files and documents.',
  },
  git: {
    label: 'Git & version control',
    description: 'MCP servers for Git and code hosting — GitHub, GitLab, and local repositories.',
  },
  database: {
    label: 'Database',
    description: 'MCP servers that query and manage SQL, NoSQL, and vector databases.',
  },
  web: {
    label: 'Web & scraping',
    description: 'MCP servers that fetch, crawl, and scrape the web into clean text.',
  },
  search: {
    label: 'Search',
    description: 'MCP servers that run web, neural, and research search.',
  },
  browser: {
    label: 'Browser automation',
    description: 'MCP servers that drive real browsers for automation and testing.',
  },
  ai: {
    label: 'AI & reasoning',
    description: 'MCP servers for memory, reasoning, embeddings, and generation.',
  },
  memory: { label: 'Memory', description: 'MCP servers that give the model persistent memory.' },
  productivity: {
    label: 'Productivity & docs',
    description: 'MCP servers for notes, tasks, issues, and knowledge tools.',
  },
  communication: {
    label: 'Communication',
    description: 'MCP servers for chat, email, and messaging.',
  },
  cloud: {
    label: 'Cloud & infrastructure',
    description: 'MCP servers for cloud platforms and infrastructure.',
  },
  monitoring: {
    label: 'Monitoring',
    description: 'MCP servers for errors, logs, and observability.',
  },
  maps: { label: 'Maps & location', description: 'MCP servers for maps, geocoding, and routing.' },
  media: {
    label: 'Media & design',
    description: 'MCP servers for images, audio, video, and design.',
  },
  'dev-tools': {
    label: 'Developer tools',
    description: 'MCP servers for coding, running, and shipping software.',
  },
  finance: {
    label: 'Finance & payments',
    description: 'MCP servers for payments and financial data.',
  },
  crm: {
    label: 'CRM & business',
    description: 'MCP servers for CRM, commerce, and business apps.',
  },
  automation: {
    label: 'Automation',
    description: 'MCP servers that automate multi-step workflows.',
  },
  data: {
    label: 'Data & analytics',
    description: 'MCP servers for analytics, charts, and data warehouses.',
  },
};

/** Servers carrying a given tag, in directory order. */
export function entriesForCategory(id: string): DirectoryEntry[] {
  return DIRECTORY.filter((e) => e.suggestedTags.includes(id));
}

/** Label + description for a tag (falls back to the raw tag if unknown). */
export function categoryMeta(id: string): DirectoryCategory {
  const m = CATEGORY_META[id];
  return { id, label: m?.label ?? id, description: m?.description ?? `MCP servers tagged ${id}.` };
}

/** Every tag present in the directory, sorted by size (desc) then id (asc). */
export function allCategoryIds(): string[] {
  const counts = new Map<string, number>();
  for (const e of DIRECTORY)
    for (const t of e.suggestedTags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)! || a.localeCompare(b));
}

/** Categories that qualify for their own page (>= MIN_CATEGORY_ENTRIES distinct servers). */
export function categoriesWithPages(): DirectoryCategory[] {
  return allCategoryIds()
    .filter((id) => entriesForCategory(id).length >= MIN_CATEGORY_ENTRIES)
    .map(categoryMeta);
}

/** True if a tag has its own collection page. */
export function categoryHasPage(id: string): boolean {
  return entriesForCategory(id).length >= MIN_CATEGORY_ENTRIES;
}

/** The subset of an entry's tags that have their own page — for linking from a server page. */
export function pagedCategoriesForEntry(entry: DirectoryEntry): DirectoryCategory[] {
  return entry.suggestedTags.filter(categoryHasPage).map(categoryMeta);
}

// ------------------------------------------------------------------------------------------------
// DB seed mirror (S15.4) — generated from DIRECTORY, guarded by a test
// ------------------------------------------------------------------------------------------------

function sqlStr(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}
function sqlArr(items: string[]): string {
  return `array[${items.map(sqlStr).join(', ')}]`;
}

/**
 * The full, idempotent SQL seed for `public.directory`, generated deterministically from DIRECTORY.
 * `supabase/seed/directory.sql` is exactly this string; `gen:directory-seed` writes it and a test
 * fails if the two ever drift.
 */
export function directorySeedSql(): string {
  const header = `-- directory.sql (S7.4, S15.4) — the curated MCP server directory, DB-backed mirror of
-- packages/core/src/directory.ts (the single source). GENERATED — do not hand-edit; run
-- \`pnpm --filter @mcpfold/core gen:directory-seed\` after changing DIRECTORY. Public, read-only
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
  token_ref text, -- a \${scheme:path} placeholder if the server needs auth; never a value
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Public browse: anyone may read the directory; nobody but service_role may write it.
alter table public.directory enable row level security;
drop policy if exists directory_public_read on public.directory;
create policy directory_public_read on public.directory for select using (true);
grant select on public.directory to anon, authenticated;
grant all on public.directory to service_role;

`;
  const rows = DIRECTORY.map((e) => {
    const cmd = e.command ? sqlStr(e.command) : 'null';
    const args = e.args ? sqlArr(e.args) : 'null';
    const url = e.url ? sqlStr(e.url) : 'null';
    const tok = e.tokenRef ? sqlStr(e.tokenRef) : 'null';
    return `  (${sqlStr(e.id)}, ${sqlStr(e.name)}, ${sqlStr(e.description)}, ${sqlStr(e.transport)}, ${cmd}, ${args}, ${url}, ${tok}, ${sqlArr(e.suggestedTags)})`;
  }).join(',\n');
  return `${header}insert into public.directory (id, name, description, transport, command, args, url, token_ref, tags)
values
${rows}
on conflict (id) do nothing;
`;
}
