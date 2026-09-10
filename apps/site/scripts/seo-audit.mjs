/**
 * Technical-SEO build guards (S15.8) — pure, dependency-free, unit-testable.
 *
 * gen-seo.mjs runs these over every prerendered route and FAILS the build if any check trips, so
 * index-bloat and broken tracking can't ship:
 *   - auditMeta: every route must have a non-empty, page-specific title + description, a canonical
 *     that matches its own URL, and no two routes may share a canonical (duplicate-content guard).
 *   - validateKeywordPages: every keyword→page target must be a real, prerendered route.
 *   - validateJsonLdUrls: every internal URL a route's JSON-LD advertises (url, isPartOf,
 *     softwareHelp, ItemList item URLs, breadcrumb items, …) must be a real, prerendered route.
 *     Structured data that points at a 404 is worse than none — it tells a crawler the page exists.
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

/**
 * Walk a JSON-LD node (or array) and collect every string that is an internal absolute URL.
 * External URLs (schema.org, github.com, npmjs.com, opensource.org) are ignored — only URLs this
 * site claims to own are checked against the route list.
 *
 * @param {unknown} node
 * @param {string} siteUrl
 * @returns {string[]} pathnames, normalized (site root -> "/", no trailing slash)
 */
export function internalUrlsIn(node, siteUrl) {
  const found = [];
  const visit = (value) => {
    if (typeof value === 'string') {
      if (value === siteUrl) found.push('/');
      else if (value.startsWith(`${siteUrl}/`)) {
        const path = value.slice(siteUrl.length).replace(/[?#].*$/, '');
        found.push(path !== '/' && path.endsWith('/') ? path.slice(0, -1) : path);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value && typeof value === 'object') {
      for (const key of Object.keys(value)) {
        // @context is always the schema.org vocabulary URL, never a page on this site.
        if (key !== '@context') visit(value[key]);
      }
    }
  };
  visit(node);
  return found;
}

/**
 * Fail the build when a route's structured data links to a URL that is not a prerendered route.
 *
 * @param {Array<{route: string, jsonLdNodes: unknown[]}>} entries
 * @param {string[]} routes every prerendered route
 * @param {{siteUrl: string}} opts
 * @returns {string[]} problems (empty = clean)
 */
export function validateJsonLdUrls(entries, routes, { siteUrl }) {
  const set = new Set(routes);
  const problems = [];
  for (const { route, jsonLdNodes } of entries) {
    // Report each dead target once per route, however many nodes repeat it.
    const dead = new Set(
      internalUrlsIn(jsonLdNodes ?? [], siteUrl).filter((p) => !set.has(p)),
    );
    for (const p of dead) {
      problems.push(`${route}: JSON-LD links to "${siteUrl}${p}", which is not a prerendered route`);
    }
  }
  return problems;
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

  // JSON-LD URL guard: catches a dead internal link, ignores external ones and @context.
  const routes = ['/', '/install', '/guides'];
  const cleanLd = [
    {
      route: '/',
      jsonLdNodes: [
        {
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          url: siteUrl,
          downloadUrl: `${siteUrl}/install`,
          softwareHelp: `${siteUrl}/guides`,
          license: 'https://opensource.org/licenses/MIT',
          sameAs: ['https://github.com/dj-pearson/MCPFold'],
        },
      ],
    },
  ];
  if (validateJsonLdUrls(cleanLd, routes, { siteUrl }).length !== 0) {
    failures.push('clean JSON-LD should pass validateJsonLdUrls');
  }
  const deadLd = [
    {
      route: '/',
      // /docs is not a route; the nested breadcrumb item is dead too. External URLs must not flag.
      jsonLdNodes: [
        { '@type': 'SoftwareApplication', softwareHelp: `${siteUrl}/docs` },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [{ '@type': 'ListItem', item: `${siteUrl}/nope` }],
        },
      ],
    },
  ];
  const deadProblems = validateJsonLdUrls(deadLd, routes, { siteUrl });
  if (deadProblems.length !== 2) {
    failures.push(`validateJsonLdUrls should flag 2 dead URLs, got ${deadProblems.length}`);
  }
  // Trailing slash and query/hash must normalize rather than false-positive.
  const normalized = [
    { route: '/', jsonLdNodes: [{ '@type': 'X', url: `${siteUrl}/guides/`, u2: `${siteUrl}/install#top` }] },
  ];
  if (validateJsonLdUrls(normalized, routes, { siteUrl }).length !== 0) {
    failures.push('validateJsonLdUrls should normalize trailing slash / hash');
  }
  if (failures.length) {
    console.error('✗ seo-audit self-test FAILED:\n  ' + failures.join('\n  '));
    process.exit(1);
  }
  console.log(
    '✓ seo-audit self-test passed (guards catch missing/duplicate meta, dead keyword pages, dead JSON-LD URLs)',
  );
}
