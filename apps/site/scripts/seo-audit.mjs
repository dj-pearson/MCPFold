/**
 * Technical-SEO build guards (S15.8) — pure, dependency-free, unit-testable.
 *
 * gen-seo.mjs runs these over every prerendered route and FAILS the build if any check trips, so
 * index-bloat and broken tracking can't ship:
 *   - auditMeta: every route must have a non-empty, page-specific title + description, a canonical
 *     that matches its own URL, and no two routes may share a canonical (duplicate-content guard).
 *   - validateKeywordPages: every keyword→page target must be a real, prerendered route.
 *
 * Run `node scripts/seo-audit.mjs --self-test` to prove the guards actually catch a bad route.
 */

const GENERIC_TITLE = 'mcpfold';

/**
 * @param {Array<{route: string, meta: {title:string, description:string, canonical:string}}>} entries
 * @param {{siteUrl: string}} opts
 * @returns {string[]} human-readable problems (empty = clean)
 */
export function auditMeta(entries, { siteUrl }) {
  const problems = [];
  const canonicals = new Map();
  for (const { route, meta } of entries) {
    if (!meta || !meta.title || !meta.title.trim()) {
      problems.push(`${route}: missing <title>`);
    } else if (route !== '/' && meta.title.trim() === GENERIC_TITLE) {
      problems.push(
        `${route}: falls back to the generic "${GENERIC_TITLE}" title (no page-specific meta)`,
      );
    }
    if (!meta || !meta.description || !meta.description.trim()) {
      problems.push(`${route}: missing meta description`);
    }
    const expected = `${siteUrl}${route === '/' ? '' : route}`;
    if (!meta || !meta.canonical) {
      problems.push(`${route}: missing canonical`);
    } else if (meta.canonical !== siteUrl + route && meta.canonical !== expected) {
      problems.push(`${route}: canonical "${meta.canonical}" does not match its own URL`);
    }
    if (meta && meta.canonical) {
      const seen = canonicals.get(meta.canonical);
      if (seen)
        problems.push(`${route}: duplicate canonical "${meta.canonical}" (also on ${seen})`);
      else canonicals.set(meta.canonical, route);
    }
  }
  return problems;
}

/**
 * @param {string[]} mapped distinct keyword→page paths
 * @param {string[]} routes every prerendered route
 * @returns {string[]} problems (empty = clean)
 */
export function validateKeywordPages(mapped, routes) {
  const set = new Set(routes);
  return mapped
    .filter((p) => !set.has(p))
    .map((p) => `keyword-map: "${p}" is not a prerendered route (renamed or removed?)`);
}

// --- Self-test: prove the guards catch real problems ----------------------------------------
if (process.argv.includes('--self-test')) {
  const siteUrl = 'https://mcpfold.com';
  const good = [
    { route: '/', meta: { title: 'mcpfold — home', description: 'x', canonical: `${siteUrl}/` } },
    {
      route: '/directory',
      meta: { title: 'Directory · mcpfold', description: 'y', canonical: `${siteUrl}/directory` },
    },
  ];
  const bad = [
    { route: '/', meta: { title: 'mcpfold — home', description: 'x', canonical: `${siteUrl}/` } },
    // Missing description + generic fallback title + wrong canonical.
    { route: '/oops', meta: { title: 'mcpfold', description: '', canonical: `${siteUrl}/` } },
  ];
  const failures = [];
  if (auditMeta(good, { siteUrl }).length !== 0) failures.push('good set should pass auditMeta');
  const badProblems = auditMeta(bad, { siteUrl });
  if (badProblems.length < 3)
    failures.push(`bad set should flag ≥3 problems, got ${badProblems.length}`);
  if (validateKeywordPages(['/nope'], ['/']).length !== 1) {
    failures.push('validateKeywordPages should flag a missing route');
  }
  if (validateKeywordPages(['/'], ['/']).length !== 0) {
    failures.push('validateKeywordPages should pass a real route');
  }
  if (failures.length) {
    console.error('✗ seo-audit self-test FAILED:\n  ' + failures.join('\n  '));
    process.exit(1);
  }
  console.log(
    '✓ seo-audit self-test passed (guards catch missing/duplicate meta + dead keyword pages)',
  );
}
