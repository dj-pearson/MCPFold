import type { Transport } from './types.js';

/**
 * Curated MCP server directory (S7.4) — the single source shared by the web app's directory and
 * the public SEO directory on the marketing site (S13.5). A neutral, community-maintained list;
 * mcpfold is not affiliated with or endorsed by these projects or the MCP project. Entries prefill
 * a valid, ref-only server entry (tokens are `${provider:path}` placeholders, never values).
 *
 * The DB-backed directory mirrors this seed (supabase/seed/directory.sql). To add a server: append
 * an entry with a unique `id`, a neutral one-line description, its transport + launch
 * (`command`/`args` for stdio, `url` for http/sse), an optional `tokenRef` placeholder if it needs
 * auth, and suggested tags. Keep copy factual — no endorsement language.
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

export const DIRECTORY_VERSION = 1;

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
    id: 'github',
    name: 'GitHub',
    description: 'Repositories, issues, and pull requests via the GitHub API.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    tokenRef: '${env:GITHUB_PAT}',
    suggestedTags: ['git', 'work'],
  },
  {
    id: 'fetch',
    name: 'Fetch',
    description: 'Fetch and convert web pages to markdown for the model.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-fetch'],
    suggestedTags: ['web'],
  },
  {
    id: 'postgres',
    name: 'Postgres',
    description: 'Read-only SQL queries against a Postgres database.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres'],
    tokenRef: '${env:DATABASE_URL}',
    suggestedTags: ['db'],
  },
  {
    id: 'playwright',
    name: 'Playwright',
    description: 'Drive a browser for scraping and end-to-end testing.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@playwright/mcp@latest'],
    suggestedTags: ['browser', 'code'],
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
