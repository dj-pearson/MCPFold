/**
 * Technical-SEO build guards (S15.8) — pure, dependency-free, unit-testable.
 *
 * gen-seo.mjs runs these over every prerendered route and FAILS the build if any check trips, so
 * index-bloat and broken tracking can't ship:
 *   - auditMeta: every route must have a non-empty, page-specific title + description, a canonical
 *     that matches its own URL, and no two routes may share a canonical (duplicate-content guard).
 *   - validateKeywordPages: every keyword→page target must be a real, prerendered route.
 *   - auditMetaLength: titles/descriptions must fit the SERP. Hard failures for values so long or
 *     so short they are broken; warnings for values that merely truncate. Presence and uniqueness
 *     were already guarded — length was not, so data-derived titles silently overflowed at scale.
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
 * SERP length budgets. Google renders titles to roughly 580px and descriptions to roughly 920px;
 * character counts are the practical proxy. The WARN bounds are where truncation starts, the FAIL
 * bounds are where the value is broken rather than merely trimmed — so a build can't ship a title
 * that gets cut mid-word on every SERP, while ordinary near-the-line copy stays a warning.
 */
export const LENGTH_BUDGET = {
  title: { warnOver: 60, failOver: 70, warnUnder: 25 },
  description: { warnOver: 155, failOver: 180, warnUnder: 70, failUnder: 50 },
};

/**
 * @param {Array<{route: string, meta: {title:string, description:string}}>} entries
 * @param {typeof LENGTH_BUDGET} [budget]
 * @returns {{problems: string[], warnings: string[]}}
 */
export function auditMetaLength(entries, budget = LENGTH_BUDGET) {
  const problems = [];
  const warnings = [];
  for (const { route, meta } of entries) {
    const title = (meta?.title ?? '').trim();
    const description = (meta?.description ?? '').trim();

    if (title.length > budget.title.failOver) {
      problems.push(`${route}: title is ${title.length} chars (>${budget.title.failOver}) — "${title}"`);
    } else if (title.length > budget.title.warnOver) {
      warnings.push(`${route}: title is ${title.length} chars, will truncate in the SERP`);
    }
    if (title.length > 0 && title.length < budget.title.warnUnder) {
      warnings.push(`${route}: title is only ${title.length} chars — thin for a SERP headline`);
    }

    if (description.length > budget.description.failOver) {
      problems.push(
        `${route}: description is ${description.length} chars (>${budget.description.failOver})`,
      );
    } else if (description.length > budget.description.warnOver) {
      warnings.push(`${route}: description is ${description.length} chars, will truncate`);
    }
    if (description.length > 0 && description.length < budget.description.failUnder) {
      problems.push(
        `${route}: description is only ${description.length} chars (<${budget.description.failUnder}) — ` +
          'too thin to serve as a snippet',
      );
    } else if (description.length > 0 && description.length < budget.description.warnUnder) {
      warnings.push(`${route}: description is only ${description.length} chars — thin snippet`);
    }
  }
  return { problems, warnings };
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

  // Length budgets: a fine value passes, an overflow fails, a near-the-line value only warns.
  const ok = 'x'.repeat(50);
  const lenGood = auditMetaLength([
    { route: '/a', meta: { title: 'A perfectly reasonable page title', description: ok + ok } },
  ]);
  if (lenGood.problems.length !== 0 || lenGood.warnings.length !== 0) {
    failures.push(
      `in-budget meta should be clean, got ${JSON.stringify(lenGood)}`,
    );
  }
  const lenWarn = auditMetaLength([
    { route: '/a', meta: { title: 'T'.repeat(65), description: 'd'.repeat(160) } },
  ]);
  if (lenWarn.problems.length !== 0) failures.push('near-the-line meta should warn, not fail');
  if (lenWarn.warnings.length !== 2) {
    failures.push(`expected 2 length warnings, got ${lenWarn.warnings.length}`);
  }
  const lenFail = auditMetaLength([
    { route: '/a', meta: { title: 'T'.repeat(80), description: 'short' } },
  ]);
  if (lenFail.problems.length !== 2) {
    failures.push(`expected 2 length failures, got ${lenFail.problems.length}`);
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
    '✓ seo-audit self-test passed (guards catch missing/duplicate meta, dead keyword pages,\n     dead JSON-LD URLs, SERP length budgets)',
  );
}
