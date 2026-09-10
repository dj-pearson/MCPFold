/**
 * In-repo keyword → page map (S15.8) — the single source of truth for rank & GEO tracking.
 *
 * Every target query the site is trying to win is listed here against the ONE canonical page meant to
 * rank for it, with its rough monthly search volume and intent. This drives:
 *   - the documented rank-check cadence (docs/seo-measurement.md reads these pairs),
 *   - the GEO prompt checklist (which head terms to ask assistants about),
 *   - a build-time guard: every `page` here must be a real, prerendered route (see gen-seo.mjs), so a
 *     renamed or removed page can never leave a tracked keyword pointing at a 404.
 *
 * SEO-15: the guide, glossary, feature, use-case and category routes have all landed, so their rows
 * are here too. Two build guards keep the map honest: every `page` must be a real prerendered route
 * (a renamed page can't leave a tracked keyword pointing at a 404), and no two rows may claim the
 * same keyword for different pages — that is cannibalization written down.
 */

export type SearchIntent = 'informational' | 'commercial' | 'transactional' | 'navigational';

export interface KeywordTarget {
  /** The target query. */
  keyword: string;
  /** The ONE canonical page meant to rank for it — must be a real prerendered route. */
  page: string;
  /** Rough monthly search volume (order-of-magnitude planning input, not a promise). */
  volume: number;
  intent: SearchIntent;
  /** Whether this term is a priority GEO (AI-answer) citation target. */
  geo?: boolean;
}

export const KEYWORD_MAP: readonly KeywordTarget[] = [
  { keyword: 'mcp config manager', page: '/', volume: 200, intent: 'commercial', geo: true },
  { keyword: 'manage mcp servers', page: '/', volume: 400, intent: 'commercial', geo: true },
  { keyword: 'mcp config', page: '/', volume: 1600, intent: 'informational', geo: true },
  { keyword: 'mcp server directory', page: '/directory', volume: 900, intent: 'commercial' },
  {
    keyword: 'best mcp servers',
    page: '/directory',
    volume: 2400,
    intent: 'commercial',
    geo: true,
  },
  {
    keyword: 'database mcp server',
    page: '/directory/category/database',
    volume: 700,
    intent: 'commercial',
  },
  { keyword: 'install mcpfold', page: '/install', volume: 50, intent: 'transactional' },
  { keyword: 'mcpfold', page: '/', volume: 100, intent: 'navigational' },
  { keyword: 'mcp secrets', page: '/security', volume: 300, intent: 'informational' },
  { keyword: 'mcp config manager pricing', page: '/pricing', volume: 40, intent: 'commercial' },
  // Token / context-window reduction cluster (docs/token-query-geo-plan.md). The pillar page is the
  // one canonical target for the head terms; the vs-page owns the "native tool-search" comparison.
  {
    keyword: 'reduce mcp token usage',
    page: '/compare/reduce-mcp-token-usage',
    volume: 900,
    intent: 'informational',
    geo: true,
  },
  {
    keyword: 'mcp too many tools context window',
    page: '/compare/reduce-mcp-token-usage',
    volume: 500,
    intent: 'informational',
    geo: true,
  },
  {
    keyword: 'mcp token optimization',
    page: '/compare/reduce-mcp-token-usage',
    volume: 400,
    intent: 'informational',
    geo: true,
  },
  {
    keyword: 'reduce mcp tokens cursor',
    page: '/compare/reduce-mcp-token-usage',
    volume: 200,
    intent: 'informational',
    geo: true,
  },
  {
    keyword: 'mcp tool search alternative',
    page: '/compare/mcpfold-vs-tool-search',
    volume: 150,
    intent: 'commercial',
    geo: true,
  },
  {
    keyword: 'mcp token calculator',
    page: '/mcp-token-calculator',
    volume: 300,
    intent: 'informational',
    geo: true,
  },
  {
    keyword: 'mcp context window calculator',
    page: '/mcp-token-calculator',
    volume: 100,
    intent: 'informational',
  },
  {
    keyword: 'open source mcp gateway',
    page: '/compare/open-source-mcp-gateway',
    volume: 350,
    intent: 'commercial',
    geo: true,
  },
  {
    keyword: 'self hosted mcp gateway',
    page: '/compare/open-source-mcp-gateway',
    volume: 200,
    intent: 'commercial',
  },

  // --- Per-client setup guides (S15.5). "how to add mcp server to X" is the dominant shape. ------
  {
    keyword: 'claude code mcp server setup',
    page: '/guides/claude-code',
    volume: 800,
    intent: 'informational',
    geo: true,
  },
  {
    keyword: 'cursor mcp server setup',
    page: '/guides/cursor',
    volume: 1300,
    intent: 'informational',
    geo: true,
  },
  {
    keyword: 'vs code mcp server setup',
    page: '/guides/vscode',
    volume: 900,
    intent: 'informational',
    geo: true,
  },
  {
    keyword: 'windsurf mcp server setup',
    page: '/guides/windsurf',
    volume: 300,
    intent: 'informational',
  },
  { keyword: 'zed mcp server setup', page: '/guides/zed', volume: 150, intent: 'informational' },
  {
    keyword: 'claude desktop mcp server setup',
    page: '/guides/claude-desktop',
    volume: 700,
    intent: 'informational',
  },
  { keyword: 'cline mcp setup', page: '/guides/cline', volume: 200, intent: 'informational' },
  {
    keyword: 'add mcp servers to any client',
    page: '/guides',
    volume: 250,
    intent: 'informational',
  },

  // --- Glossary / definitional cluster (S15.6). Pure "what is X" intent, prime GEO citation bait.
  {
    keyword: 'what is an mcp server',
    page: '/glossary/mcp-server',
    volume: 2900,
    intent: 'informational',
    geo: true,
  },
  {
    keyword: 'what is model context protocol',
    page: '/glossary/model-context-protocol',
    volume: 3600,
    intent: 'informational',
    geo: true,
  },
  {
    keyword: 'what is an mcp client',
    page: '/glossary/mcp-client',
    volume: 600,
    intent: 'informational',
  },
  { keyword: 'mcp tools explained', page: '/glossary/mcp-tools', volume: 400, intent: 'informational' },
  {
    keyword: 'context window explained',
    page: '/glossary/context-window',
    volume: 1200,
    intent: 'informational',
  },
  {
    keyword: 'secret reference config',
    page: '/glossary/secret-reference',
    volume: 100,
    intent: 'informational',
  },
  // NOTE: the head term "mcp config manager" belongs to "/" (commercial intent, above). The
  // glossary page owns only the definitional phrasing, and /compare/mcp-config-manager owns the
  // comparison phrasing — three pages, three distinct queries, no overlap.
  {
    keyword: 'what is an mcp config manager',
    page: '/glossary/mcp-config-manager',
    volume: 150,
    intent: 'informational',
  },
  { keyword: 'mcp glossary', page: '/glossary', volume: 200, intent: 'informational' },

  // --- Feature deep-dives (S13.10). Mechanism queries, mid-funnel. -------------------------------
  {
    keyword: 'one mcp config for every client',
    page: '/features/one-config',
    volume: 150,
    intent: 'commercial',
  },
  {
    keyword: 'curate mcp tools',
    page: '/features/tool-curation',
    volume: 250,
    intent: 'commercial',
    geo: true,
  },
  {
    keyword: 'mcp secrets management',
    page: '/features/secrets',
    volume: 400,
    intent: 'informational',
  },
  {
    keyword: 'mcp config drift',
    page: '/features/sync-drift',
    volume: 90,
    intent: 'informational',
  },

  // --- Persona pages (S13.11). Situation-shaped queries. -----------------------------------------
  {
    keyword: 'share mcp config across clients',
    page: '/use-cases/solo',
    volume: 200,
    intent: 'commercial',
  },
  {
    keyword: 'team mcp configuration',
    page: '/use-cases/teams',
    volume: 300,
    intent: 'commercial',
  },
  {
    keyword: 'too many mcp servers',
    page: '/use-cases/power-users',
    volume: 350,
    intent: 'informational',
    geo: true,
  },

  // --- Directory collection pages (S15.4). "best <category> mcp servers" is the whole shape. -----
  {
    keyword: 'dev tools mcp servers',
    page: '/directory/category/dev-tools',
    volume: 400,
    intent: 'commercial',
  },
  { keyword: 'ai mcp servers', page: '/directory/category/ai', volume: 500, intent: 'commercial' },
  {
    keyword: 'cloud mcp servers',
    page: '/directory/category/cloud',
    volume: 300,
    intent: 'commercial',
  },
  {
    keyword: 'browser automation mcp server',
    page: '/directory/category/browser',
    volume: 600,
    intent: 'commercial',
  },
  {
    keyword: 'search mcp server',
    page: '/directory/category/search',
    volume: 450,
    intent: 'commercial',
  },
  {
    keyword: 'git mcp server',
    page: '/directory/category/git',
    volume: 550,
    intent: 'commercial',
  },
  {
    keyword: 'file system mcp server',
    page: '/directory/category/files',
    volume: 700,
    intent: 'commercial',
  },
];

/** The distinct set of canonical pages any tracked keyword points at (for the build-time guard). */
export function mappedPaths(): string[] {
  return [...new Set(KEYWORD_MAP.map((k) => k.page))];
}

/** Every tracked row, for the build-time cannibalization + coverage guards (SEO-15). */
export function keywordRows(): Array<{ keyword: string; page: string; volume: number }> {
  return KEYWORD_MAP.map((k) => ({ keyword: k.keyword, page: k.page, volume: k.volume }));
}

/** The primary tracked keyword for a page, if any (first match in declaration order). */
export function keywordFor(page: string): string | undefined {
  return KEYWORD_MAP.find((k) => k.page === page)?.keyword;
}
