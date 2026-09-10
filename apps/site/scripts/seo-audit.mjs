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
 *   - auditRedirects: every _redirects rule must send traffic somewhere the site still serves, and
 *     must not shadow a live route. A redirect whose target was renamed 301s into a 404 silently.
 *   - auditEntityGraph: every route must carry the shared Organization + WebSite pair, with the
 *     stable @id URIs the page-type nodes reference — the graph must have one subject, not many.
 *   - auditBreadcrumbs: every non-home route must emit exactly one BreadcrumbList, rooted at the
 *     home page, with contiguous positions and a last item equal to that page's own canonical.
 *   - validateRelatedLinks: every cross-silo related link must resolve to a real route, so the
 *     internal-link mesh can never point somewhere the site doesn't serve.
 *   - validateJsonLdUrls: every internal URL a route's JSON-LD advertises (url, isPartOf,
 *     softwareHelp, ItemList item URLs, breadcrumb items, …) must be a real, prerendered route or
 *     live under a prefix served by a sibling static build (see EXTERNALLY_SERVED). Structured data
 *     that points at a 404 is worse than none — it tells a crawler the page exists.
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
/**
 * Fail the build when the related-links mesh (SEO-7) points at a path the site doesn't serve, and
 * when a page type that should carry the block renders none.
 *
 * @param {Array<{route: string, relatedHrefs: string[]}>} entries
 * @param {string[]} routes every prerendered route
 * @param {{expectLinksUnder?: string[]}} [opts] path prefixes that MUST produce related links
 * @returns {string[]} problems (empty = clean)
 */
export function validateRelatedLinks(entries, routes, { expectLinksUnder = [] } = {}) {
  const set = new Set(routes);
  const problems = [];
  const covered = new Set();
  for (const { route, relatedHrefs } of entries) {
    const hrefs = relatedHrefs ?? [];
    for (const href of new Set(hrefs)) {
      if (!set.has(href) && !isExternallyServed(href)) {
        problems.push(`${route}: related link "${href}" is not a route`);
      }
      if (href === route) problems.push(`${route}: related link points at itself`);
    }
    const prefix = expectLinksUnder.find((x) => route.startsWith(x));
    if (prefix) {
      if (hrefs.length === 0) problems.push(`${route}: expected related links, got none`);
      else covered.add(prefix);
    }
  }
  // A whole page type silently losing its block is the regression worth catching, not one page.
  for (const prefix of expectLinksUnder) {
    if (!covered.has(prefix) && entries.some((e) => e.route.startsWith(prefix))) {
      problems.push(`no page under "${prefix}" produced related links`);
    }
  }
  return problems;
}

/**
 * Redirect-map sanity (SEO-10). A redirect is a promise that an old URL still leads somewhere; when
 * its target is renamed the rule quietly starts 301ing into a 404, which is worse than no rule at
 * all because the link equity is spent on the way.
 *
 * @param {string} text contents of public/_redirects
 * @param {string[]} routes every prerendered route
 * @returns {string[]} problems (empty = clean)
 */
export function auditRedirects(text, routes) {
  const set = new Set(routes);
  const problems = [];
  const seen = new Set();

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const [from, to, status] = trimmed.split(/\s+/);
    if (!from || !to) {
      problems.push(`_redirects: cannot parse "${trimmed}"`);
      continue;
    }
    if (status && !/^30[128]!?$/.test(status)) {
      problems.push(`_redirects: "${from}" uses status "${status}" — use 301, 302 or 308`);
    }
    if (seen.has(from)) problems.push(`_redirects: duplicate rule for "${from}"`);
    seen.add(from);

    // A rule whose source is itself a live route shadows that page — the page becomes unreachable.
    if (set.has(from)) {
      problems.push(`_redirects: "${from}" is a live route; the rule shadows it`);
    }

    // Only internal, non-splat targets can be checked against the route list. A :splat target
    // depends on the request, and an absolute URL leaves the site.
    if (!to.startsWith('/') || to.includes(':splat')) continue;
    if (!set.has(to) && !isExternallyServed(to) && !isStaticFile(to)) {
      problems.push(`_redirects: "${from}" points at "${to}", which is not a route`);
    }
  }
  return problems;
}

/**
 * Site-wide entity graph (SEO-5). A crawler landing on any page must be able to resolve who
 * publishes it; that only works if every route carries the same Organization and WebSite nodes
 * under stable @id URIs that the page-type nodes reference.
 *
 * @param {Array<{route: string, jsonLdNodes: unknown[]}>} entries
 * @param {{siteUrl: string}} opts
 * @returns {string[]} problems (empty = clean)
 */
export function auditEntityGraph(entries, { siteUrl }) {
  const expected = {
    Organization: `${siteUrl}/#organization`,
    WebSite: `${siteUrl}/#website`,
  };
  const problems = [];
  for (const { route, jsonLdNodes } of entries) {
    const nodes = jsonLdNodes ?? [];
    for (const [type, id] of Object.entries(expected)) {
      const found = nodes.filter((n) => n && n['@type'] === type);
      if (found.length === 0) {
        problems.push(`${route}: no ${type} node — the page does not resolve to the site entity`);
      } else if (found.length > 1) {
        problems.push(`${route}: ${found.length} ${type} nodes (expected 1)`);
      } else if (found[0]['@id'] !== id) {
        problems.push(`${route}: ${type} @id is "${found[0]['@id']}", expected "${id}"`);
      }
    }
    // A reference to an @id that no node in the graph defines is a dangling edge.
    const defined = new Set(nodes.map((n) => n && n['@id']).filter(Boolean));
    for (const ref of referencedIds(nodes)) {
      if (!defined.has(ref)) problems.push(`${route}: references undefined @id "${ref}"`);
    }
  }
  return problems;
}

/** Every `{'@id': …}` reference nested anywhere in the nodes, excluding the definitions themselves. */
function referencedIds(nodes) {
  const refs = [];
  const visit = (value, isRoot) => {
    if (Array.isArray(value)) {
      value.forEach((v) => visit(v, false));
      return;
    }
    if (!value || typeof value !== 'object') return;
    // A bare {'@id': …} with no other schema keys is a reference, not a definition.
    const keys = Object.keys(value);
    if (!isRoot && keys.length === 1 && keys[0] === '@id') {
      refs.push(value['@id']);
      return;
    }
    for (const key of keys) if (key !== '@context') visit(value[key], false);
  };
  nodes.forEach((n) => visit(n, true));
  return refs;
}

/**
 * Breadcrumb coverage and shape (SEO-9). Breadcrumbs drive the path Google shows in place of the
 * raw URL, which matters most on exactly the deep generated pages that had no trail at all.
 *
 * @param {Array<{route: string, jsonLdNodes: unknown[]}>} entries
 * @param {{siteUrl: string}} opts
 * @returns {string[]} problems (empty = clean)
 */
export function auditBreadcrumbs(entries, { siteUrl }) {
  const problems = [];
  for (const { route, jsonLdNodes } of entries) {
    const lists = (jsonLdNodes ?? []).filter((n) => n && n['@type'] === 'BreadcrumbList');
    if (route === '/') {
      if (lists.length > 0) problems.push('/: the home page should not emit a BreadcrumbList');
      continue;
    }
    if (lists.length === 0) {
      problems.push(`${route}: no BreadcrumbList`);
      continue;
    }
    if (lists.length > 1) {
      problems.push(`${route}: ${lists.length} BreadcrumbList nodes (expected 1)`);
      continue;
    }
    const items = lists[0].itemListElement ?? [];
    if (items.length < 2) {
      problems.push(`${route}: breadcrumb has ${items.length} item(s) — needs at least Home + self`);
      continue;
    }
    items.forEach((item, i) => {
      if (item.position !== i + 1) {
        problems.push(`${route}: breadcrumb item ${i + 1} has position ${item.position}`);
      }
      if (!item.name || !String(item.name).trim()) {
        problems.push(`${route}: breadcrumb item ${i + 1} has no name`);
      }
    });
    if (items[0].item !== `${siteUrl}/`) {
      problems.push(`${route}: breadcrumb does not start at the home page (got "${items[0].item}")`);
    }
    const last = items[items.length - 1];
    if (last.item !== `${siteUrl}${route}`) {
      problems.push(
        `${route}: breadcrumb ends at "${last.item}", not this page's own canonical`,
      );
    }
  }
  return problems;
}

/**
 * Path prefixes this site serves that are NOT prerendered SPA routes. /docs is its own static build
 * (S8.1) deployed alongside dist/, so its URLs are live even though allRoutes() never lists them.
 */
export const EXTERNALLY_SERVED = ['/docs'];

const isExternallyServed = (path) =>
  EXTERNALLY_SERVED.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

/** A target with a file extension is an asset (a logo, an OG card), not a route. */
const isStaticFile = (path) => /\.[a-z0-9]{2,5}$/i.test(path);

export function validateJsonLdUrls(entries, routes, { siteUrl }) {
  const set = new Set(routes);
  const problems = [];
  for (const { route, jsonLdNodes } of entries) {
    // Report each dead target once per route, however many nodes repeat it.
    const dead = new Set(
      internalUrlsIn(jsonLdNodes ?? [], siteUrl).filter(
        (p) => !set.has(p) && !isExternallyServed(p) && !isStaticFile(p),
      ),
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

  // Redirects: targets must resolve, sources must not shadow live pages.
  const redirectRoutes = ['/', '/install', '/directory'];
  const cleanRedirects = auditRedirects(
    [
      '# a comment',
      '',
      'https://www.example.com/*   https://example.com/:splat   301!',
      '/download          /install           301',
      '/server/*          /directory/:splat  301',
      '/docs.html         /docs              301',
    ].join('\n'),
    redirectRoutes,
  );
  if (cleanRedirects.length !== 0) {
    failures.push(`clean _redirects should pass, got ${JSON.stringify(cleanRedirects)}`);
  }
  const badRedirects = auditRedirects(
    [
      '/old               /renamed-away      301',
      '/install           /                  301',
      '/download          /install           404',
      '/download          /install           301',
    ].join('\n'),
    redirectRoutes,
  );
  const redirectHas = (needle) => badRedirects.some((x) => x.includes(needle));
  if (!redirectHas('"/renamed-away"')) failures.push('should flag a dead redirect target');
  if (!redirectHas('shadows it')) failures.push('should flag a rule shadowing a live route');
  if (!redirectHas('status "404"')) failures.push('should flag a non-redirect status');
  if (!redirectHas('duplicate rule')) failures.push('should flag a duplicate rule');

  // Entity graph: the shared pair must be present with the right @id, and refs must resolve.
  const entityOk = [
    {
      route: '/x',
      jsonLdNodes: [
        { '@type': 'Organization', '@id': `${siteUrl}/#organization` },
        { '@type': 'WebSite', '@id': `${siteUrl}/#website`, publisher: { '@id': `${siteUrl}/#organization` } },
        { '@type': 'TechArticle', isPartOf: { '@id': `${siteUrl}/#website` } },
      ],
    },
  ];
  if (auditEntityGraph(entityOk, { siteUrl }).length !== 0) {
    failures.push(`connected entity graph should pass: ${auditEntityGraph(entityOk, { siteUrl })}`);
  }
  const entityBad = [
    // No WebSite at all, wrong Organization @id, and a reference nothing defines.
    {
      route: '/y',
      jsonLdNodes: [
        { '@type': 'Organization', '@id': `${siteUrl}/#org` },
        { '@type': 'TechArticle', isPartOf: { '@id': `${siteUrl}/#website` } },
      ],
    },
  ];
  const entityProblems = auditEntityGraph(entityBad, { siteUrl });
  if (entityProblems.length !== 3) {
    failures.push(`expected 3 entity-graph problems, got ${entityProblems.length}: ${entityProblems}`);
  }
  // Organization.logo is a static file, not a route — it must not read as a dead JSON-LD URL.
  const logoLd = [
    { route: '/', jsonLdNodes: [{ '@type': 'Organization', logo: `${siteUrl}/apple-touch-icon.png` }] },
  ];
  if (validateJsonLdUrls(logoLd, ['/'], { siteUrl }).length !== 0) {
    failures.push('a static asset URL in JSON-LD must not be flagged as dead');
  }

  // Breadcrumbs: coverage, root, ordering and self-terminating trail.
  const crumb = (path, trail) => ({
    route: path,
    jsonLdNodes: [
      {
        '@type': 'BreadcrumbList',
        itemListElement: trail.map((c, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: c.name,
          item: `${siteUrl}${c.path}`,
        })),
      },
    ],
  });
  const goodCrumbs = [
    { route: '/', jsonLdNodes: [{ '@type': 'SoftwareApplication' }] },
    crumb('/directory/github', [
      { name: 'Home', path: '/' },
      { name: 'Directory', path: '/directory' },
      { name: 'GitHub', path: '/directory/github' },
    ]),
  ];
  if (auditBreadcrumbs(goodCrumbs, { siteUrl }).length !== 0) {
    failures.push('well-formed breadcrumbs should pass');
  }
  const badCrumbs = [
    // Home must not carry a trail.
    crumb('/', [{ name: 'Home', path: '/' }, { name: 'Home', path: '/' }]),
    // Missing entirely.
    { route: '/pricing', jsonLdNodes: [] },
    // Does not start at Home, and does not end at its own canonical.
    crumb('/guides/cursor', [
      { name: 'Guides', path: '/guides' },
      { name: 'Cursor', path: '/guides/zed' },
    ]),
  ];
  const crumbProblems = auditBreadcrumbs(badCrumbs, { siteUrl });
  if (crumbProblems.length !== 4) {
    failures.push(`expected 4 breadcrumb problems, got ${crumbProblems.length}: ${crumbProblems}`);
  }

  // Related-links mesh: dead targets, self-links and a page type losing its block all fail.
  const relOk = [
    { route: '/directory/a', relatedHrefs: ['/guides', '/install'] },
    { route: '/guides/x', relatedHrefs: ['/directory'] },
  ];
  const relRoutes = ['/directory/a', '/guides/x', '/guides', '/install', '/directory'];
  if (
    validateRelatedLinks(relOk, relRoutes, { expectLinksUnder: ['/directory/', '/guides/'] })
      .length !== 0
  ) {
    failures.push('clean related links should pass');
  }
  const relBad = [
    { route: '/directory/a', relatedHrefs: ['/nope', '/directory/a'] },
    { route: '/guides/x', relatedHrefs: [] },
  ];
  const relProblems = validateRelatedLinks(relBad, relRoutes, {
    expectLinksUnder: ['/directory/', '/guides/'],
  });
  // dead target + self-link + empty block + the whole /guides/ type uncovered
  if (relProblems.length !== 4) {
    failures.push(`expected 4 related-link problems, got ${relProblems.length}`);
  }
  // /docs is served by the docs build, so it is a legal related target too.
  if (
    validateRelatedLinks([{ route: '/x', relatedHrefs: ['/docs/secrets.html'] }], ['/x'], {}).length !==
    0
  ) {
    failures.push('/docs/* should be a legal related target');
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
      // Neither path exists anywhere; the nested breadcrumb item is dead too.
      jsonLdNodes: [
        { '@type': 'SoftwareApplication', softwareHelp: `${siteUrl}/handbook` },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [{ '@type': 'ListItem', item: `${siteUrl}/nope` }],
        },
      ],
    },
  ];
  // /docs is served by the sibling docs build, so it must NOT be reported as dead.
  const docsLd = [{ route: '/', jsonLdNodes: [{ '@type': 'X', softwareHelp: `${siteUrl}/docs` }] }];
  if (validateJsonLdUrls(docsLd, routes, { siteUrl }).length !== 0) {
    failures.push('/docs is served by the docs build and must not be flagged');
  }
  const docsDeep = [
    { route: '/', jsonLdNodes: [{ '@type': 'X', url: `${siteUrl}/docs/secrets.html` }] },
  ];
  if (validateJsonLdUrls(docsDeep, routes, { siteUrl }).length !== 0) {
    failures.push('/docs/* is served by the docs build and must not be flagged');
  }

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
    '✓ seo-audit self-test passed (guards catch missing/duplicate meta, dead keyword pages,\n     dead JSON-LD URLs, SERP length budgets,\n     broken related links,\n     breadcrumb coverage,\n     entity graph,\n     redirect map)',
  );
}
