/**
 * Per-URL <lastmod> resolution for the sitemaps (SEO-1).
 *
 * Every URL in the sitemap index used to carry the same build date. Google explicitly discards
 * lastmod when a site stamps every URL with the same value on every deploy — the signal is
 * worthless if a docs typo "modifies" 400 directory pages. This resolver instead dates each route
 * from the CONTENT that actually produces it: the last commit that touched the source file(s)
 * behind that route. A page's lastmod then only moves when that page really changed, which is what
 * makes the signal usable for crawl scheduling.
 *
 * Read-only and dependency-free: it shells out to `git log`, caches one lookup per source file
 * (~20 distinct files for the whole site), and falls back to the build date whenever git is
 * unavailable (Docker builds without .git, tarball checkouts) or a path has no history yet.
 *
 * Run `node scripts/lastmod.mjs --self-test` to prove the route→source mapping and the fallback.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
/** apps/site */
const SITE_DIR = join(here, '..');
/** repo root */
const REPO_ROOT = join(SITE_DIR, '..', '..');

const SITE = 'apps/site/src';
const CONTENT = 'apps/site/content';

/** Data modules that back a whole page type. One edit here legitimately re-dates that type. */
const SOURCES = {
  directory: ['packages/core/src/directory.ts'],
  guides: [`${SITE}/guides/guides.data.ts`, `${SITE}/guides/steps.ts`],
  glossary: [`${SITE}/glossary/terms.ts`],
  compare: [`${SITE}/compare/comparisons.ts`],
  features: [`${SITE}/features/features.ts`],
  useCases: [`${SITE}/use-cases/use-cases.ts`],
  legal: [`${SITE}/legal/legal-content.ts`],
};

/**
 * Map a route pathname to the repo-relative source file(s) whose last change dates that page.
 * Unknown routes return [] and fall back to the build date.
 *
 * @param {string} route pathname, e.g. "/guides/cursor"
 * @returns {string[]} repo-relative paths
 */
export function sourcesForRoute(route) {
  const p = route !== '/' && route.endsWith('/') ? route.slice(0, -1) : route;

  if (p.startsWith('/blog/')) return [`${CONTENT}/blog/${p.slice('/blog/'.length)}.md`];
  if (p === '/blog') return [`${CONTENT}/blog`];
  if (p === '/changelog') return ['CHANGELOG.md', `${SITE}/blog/Changelog.tsx`];
  if (p.startsWith('/directory')) return SOURCES.directory;
  if (p.startsWith('/guides')) return SOURCES.guides;
  if (p.startsWith('/glossary')) return SOURCES.glossary;
  if (p.startsWith('/compare')) return SOURCES.compare;
  if (p.startsWith('/features')) return SOURCES.features;
  if (p.startsWith('/use-cases')) return SOURCES.useCases;

  const CORE = {
    '/': [`${SITE}/pages/Home.tsx`, `${SITE}/home`],
    '/install': [`${SITE}/install/InstallPage.tsx`],
    '/pricing': [`${SITE}/pricing/PricingPage.tsx`, `${SITE}/pricing/tiers.ts`],
    '/security': [`${SITE}/security/SecurityPage.tsx`],
    '/about': [`${SITE}/about/About.tsx`],
    '/community': [`${SITE}/community/Community.tsx`],
    '/brand': [`${SITE}/brand/Brand.tsx`],
    '/roadmap': [`${SITE}/roadmap/Roadmap.tsx`],
    '/mcp-token-calculator': [`${SITE}/calculator/TokenCalculatorPage.tsx`, `${SITE}/benchmark`],
  };
  if (CORE[p]) return CORE[p];

  // Legal docs all render from one content module.
  if (['/privacy', '/terms', '/analytics', '/accessibility'].includes(p)) return SOURCES.legal;
  return [];
}

/** ISO date (YYYY-MM-DD) of the last commit touching `path`, or undefined. */
function gitDate(path, cwd) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', path], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Build a `(route) => "YYYY-MM-DD"` resolver.
 *
 * @param {{fallback: string, repoRoot?: string}} opts `fallback` is the build date.
 */
export function createLastmodResolver({ fallback, repoRoot = REPO_ROOT }) {
  const hasGit = existsSync(join(repoRoot, '.git')) && gitDate('.', repoRoot) !== undefined;
  /** @type {Map<string, string|undefined>} */
  const cache = new Map();

  const dateFor = (path) => {
    if (!cache.has(path)) cache.set(path, hasGit ? gitDate(path, repoRoot) : undefined);
    return cache.get(path);
  };

  return function lastmodFor(route) {
    const dates = sourcesForRoute(route).map(dateFor).filter(Boolean);
    if (dates.length === 0) return fallback;
    // Most recent of the sources that produce this page, never dated into the future.
    const newest = dates.sort()[dates.length - 1];
    return newest > fallback ? fallback : newest;
  };
}

// --- Self-test -------------------------------------------------------------------------------
if (process.argv.includes('--self-test')) {
  const failures = [];
  const eq = (label, actual, expected) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  };

  eq('blog post → its markdown', sourcesForRoute('/blog/introducing-mcpfold'), [
    `${CONTENT}/blog/introducing-mcpfold.md`,
  ]);
  eq('directory entry → core data', sourcesForRoute('/directory/github'), SOURCES.directory);
  eq('category → core data', sourcesForRoute('/directory/category/files'), SOURCES.directory);
  eq('guide → guide data', sourcesForRoute('/guides/cursor'), SOURCES.guides);
  eq('glossary term → terms', sourcesForRoute('/glossary/mcp-server'), SOURCES.glossary);
  eq('legal → legal content', sourcesForRoute('/privacy'), SOURCES.legal);
  eq('trailing slash normalizes', sourcesForRoute('/guides/'), SOURCES.guides);
  if (sourcesForRoute('/').length === 0) failures.push('home should map to a source');

  // Every route the site prerenders must map to at least one source, or its lastmod is a
  // meaningless build date. Guard against a new page type silently regressing to the fallback.
  for (const r of ['/install', '/pricing', '/features/one-config', '/use-cases/teams', '/roadmap']) {
    if (sourcesForRoute(r).length === 0) failures.push(`${r}: no source mapping`);
  }

  // Fallback path: a repo root with no .git must still produce the build date.
  const noGit = createLastmodResolver({ fallback: '2020-01-01', repoRoot: '/nonexistent-repo-root' });
  eq('no-git fallback', noGit('/guides/cursor'), '2020-01-01');
  eq('unknown route falls back', noGit('/totally/unknown/deep/route'), '2020-01-01');

  // Real repo: dates must be well-formed and never later than the build date.
  const real = createLastmodResolver({ fallback: new Date().toISOString().slice(0, 10) });
  for (const r of ['/', '/guides/cursor', '/directory', '/blog/introducing-mcpfold']) {
    const d = real(r);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) failures.push(`${r}: malformed lastmod "${d}"`);
  }

  if (failures.length) {
    console.error('✗ lastmod self-test FAILED:\n  ' + failures.join('\n  '));
    process.exit(1);
  }
  console.log('✓ lastmod self-test passed (route→source mapping, git dates, no-git fallback)');
}
