/**
 * The keyword → page map (S15.3). Documents the single focus keyword cluster each core page targets,
 * so on-page copy, titles, and the internal-link graph stay coherent as the site grows. This is the
 * source of intent; the actual copy lives in each page + `meta.ts`.
 *
 * `status: 'live'` pages exist today; `status: 'planned'` pages ship with their own story (guides
 * S15.5, glossary S15.6) — the homepage links to them once they're live.
 */

export interface KeywordTarget {
  path: string;
  /** The primary keyword cluster this page should rank for and read as the answer to. */
  keyword: string;
  /** Supporting terms to weave into the copy. */
  related: string[];
  status: 'live' | 'planned';
}

export const KEYWORD_MAP: KeywordTarget[] = [
  {
    path: '/',
    keyword: 'MCP config',
    related: [
      'one config for every MCP client',
      'manage MCP servers',
      'sync MCP config across clients',
    ],
    status: 'live',
  },
  {
    path: '/install',
    keyword: 'install mcpfold',
    related: ['mcpfold npm', 'mcpfold Homebrew', 'MCP config CLI'],
    status: 'live',
  },
  {
    path: '/directory',
    keyword: 'MCP server directory',
    related: ['find MCP servers', 'add an MCP server', 'MCP registry'],
    status: 'live',
  },
  {
    path: '/pricing',
    keyword: 'mcpfold pricing',
    related: ['MCP config free', 'MCP team config', 'self-host MCP cloud'],
    status: 'live',
  },
  {
    path: '/docs/coverage',
    keyword: 'MCP client support',
    related: ['Claude Code MCP config', 'VS Code MCP config', 'Cursor MCP config'],
    status: 'live',
  },
  {
    path: '/guides',
    keyword: 'add MCP servers to <client>',
    related: ['per-client MCP setup', 'Claude Desktop MCP setup', 'Windsurf MCP setup'],
    status: 'planned', // S15.5
  },
  {
    path: '/glossary',
    keyword: 'MCP terms',
    related: ['what is MCP', 'what is an MCP server', 'stdio vs streamable-http'],
    status: 'planned', // S15.6
  },
];

/** The primary keyword for a path, or undefined if it isn't mapped. */
export function keywordFor(path: string): string | undefined {
  return KEYWORD_MAP.find((k) => k.path === path)?.keyword;
}
