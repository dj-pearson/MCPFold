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
 * Pages that ship in later pSEO stories (guides/glossary/compare) get their keyword rows added when
 * those routes land — the sitemap/OG machinery already covers them generically.
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
];

/** The distinct set of canonical pages any tracked keyword points at (for the build-time guard). */
export function mappedPaths(): string[] {
  return [...new Set(KEYWORD_MAP.map((k) => k.page))];
}

/** The primary tracked keyword for a page, if any (first match in declaration order). */
export function keywordFor(page: string): string | undefined {
  return KEYWORD_MAP.find((k) => k.page === page)?.keyword;
}
