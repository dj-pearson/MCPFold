/**
 * Internal link-graph audit over the prerendered HTML (SEO-8).
 *
 * The other build guards reason about the data that produces pages. This one reads what actually
 * shipped: it walks every dist/**\/index.html, extracts the internal <a href> targets, and checks
 * the graph those links form. That catches the class of problem no data-level guard can see — a
 * page that renders but that nothing links to, a link the shell emits to a path that no longer
 * exists, or a page type whose links vanished because a component stopped rendering.
 *
 * Three checks, all build failures:
 *   - dead link:     an internal href that is neither a prerendered route, a path served by the
 *                    sibling docs build, nor a static file.
 *   - orphan:        a prerendered route no OTHER page links to. Google reaches it only via the
 *                    sitemap, and it accrues no internal PageRank.
 *   - no outbound:   a page with no internal links at all — the shell failed to render.
 *
 * Pure and dependency-free apart from reading files; run `node scripts/link-graph.mjs --self-test`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { EXTERNALLY_SERVED } from './seo-audit.mjs';

/** Extract internal link targets from a page's HTML, normalized to pathnames. */
export function internalHrefsFromHtml(html) {
  const out = [];
  for (const m of html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/gi)) {
    const raw = (m[1] ?? '').trim();
    // Skip external, protocol-relative, in-page and non-navigational hrefs.
    if (!raw.startsWith('/') || raw.startsWith('//')) continue;
    const path = raw.replace(/[?#].*$/, '');
    if (!path) continue;
    out.push(path !== '/' && path.endsWith('/') ? path.slice(0, -1) : path);
  }
  return [...new Set(out)];
}

const isExternallyServed = (path) =>
  EXTERNALLY_SERVED.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

/** A target with a file extension is an asset (feed.xml, og.png, llms.txt), not a route. */
const isStaticFile = (path) => /\.[a-z0-9]{2,5}$/i.test(path);

/**
 * @param {Array<{route: string, hrefs: string[]}>} pages
 * @param {string[]} routes every prerendered route
 * @returns {string[]} problems (empty = clean)
 */
export function auditLinkGraph(pages, routes) {
  const routeSet = new Set(routes);
  const problems = [];
  const inbound = new Map(routes.map((r) => [r, 0]));

  for (const { route, hrefs } of pages) {
    if (hrefs.length === 0) {
      problems.push(`${route}: no internal links at all — the shell did not render`);
    }
    for (const href of hrefs) {
      if (routeSet.has(href)) {
        // Self-links don't earn a page any standing; only count links from elsewhere.
        if (href !== route) inbound.set(href, (inbound.get(href) ?? 0) + 1);
      } else if (!isExternallyServed(href) && !isStaticFile(href)) {
        problems.push(`${route}: links to "${href}", which is not a route or a served path`);
      }
    }
  }

  for (const [route, count] of inbound) {
    // The home page is reached from the logo on every page; it is never an orphan by construction.
    if (count === 0 && route !== '/') {
      problems.push(`${route}: orphan — no other page links to it (sitemap-only)`);
    }
  }
  return problems;
}

/** Read a built dist/ into `[{route, hrefs}]`. "/" is dist/index.html; "/x/y" is dist/x/y/index.html. */
export function readPrerenderedPages(dist) {
  const pages = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (name === 'index.html') {
        const rel = relative(dist, dir).split(sep).filter(Boolean).join('/');
        pages.push({
          route: rel ? `/${rel}` : '/',
          hrefs: internalHrefsFromHtml(readFileSync(full, 'utf8')),
        });
      }
    }
  };
  walk(dist);
  return pages;
}

// --- Self-test -------------------------------------------------------------------------------
if (process.argv.includes('--self-test')) {
  const failures = [];

  const hrefs = internalHrefsFromHtml(`
    <a href="/directory">d</a>
    <a href='/skipped-single-quotes'>not matched by design</a>
    <a href="/guides/cursor?utm=x#top">g</a>
    <a href="/directory/">trailing slash</a>
    <a href="https://github.com/x">ext</a>
    <a href="//cdn.example.com/x">protocol-relative</a>
    <a href="#main">anchor</a>
    <a href="mailto:a@b.c">mail</a>
    <a class="x" href="/feed.xml">feed</a>
  `);
  const expect = (label, cond) => {
    if (!cond) failures.push(label);
  };
  expect('collects internal hrefs', hrefs.includes('/directory'));
  expect('strips query and hash', hrefs.includes('/guides/cursor'));
  expect('normalizes trailing slash into one entry', hrefs.filter((h) => h === '/directory').length === 1);
  expect('drops external', !hrefs.some((h) => h.startsWith('http')));
  expect('drops protocol-relative', !hrefs.some((h) => h.startsWith('//')));
  expect('drops anchors and mailto', !hrefs.includes('#main') && !hrefs.some((h) => h.includes('mailto')));
  expect('keeps static files for the dead-link check', hrefs.includes('/feed.xml'));

  const routes = ['/', '/directory', '/directory/github', '/guides', '/lonely'];
  const clean = auditLinkGraph(
    [
      { route: '/', hrefs: ['/directory', '/guides', '/lonely'] },
      { route: '/directory', hrefs: ['/', '/directory/github'] },
      { route: '/directory/github', hrefs: ['/', '/directory', '/feed.xml', '/docs/secrets.html'] },
      { route: '/guides', hrefs: ['/'] },
      { route: '/lonely', hrefs: ['/'] },
    ],
    routes,
  );
  if (clean.length !== 0) failures.push(`clean graph should pass, got ${JSON.stringify(clean)}`);

  const dirty = auditLinkGraph(
    [
      { route: '/', hrefs: ['/directory', '/gone'] },
      { route: '/directory', hrefs: ['/'] },
      // Nothing links to /directory/github or /guides; /lonely only links to itself.
      { route: '/directory/github', hrefs: ['/'] },
      { route: '/guides', hrefs: [] },
      { route: '/lonely', hrefs: ['/lonely'] },
    ],
    routes,
  );
  const hasProblem = (needle) => dirty.some((p) => p.includes(needle));
  expect('flags a dead link', hasProblem('"/gone"'));
  expect('flags a page with no outbound links', hasProblem('no internal links at all'));
  expect('flags an orphan', hasProblem('/directory/github: orphan'));
  expect('flags a self-link-only page as an orphan', hasProblem('/lonely: orphan'));
  expect('never calls the home page an orphan', !hasProblem('/: orphan'));

  if (failures.length) {
    console.error('✗ link-graph self-test FAILED:\n  ' + failures.join('\n  '));
    process.exit(1);
  }
  console.log('✓ link-graph self-test passed (dead links, orphans, empty shells)');
}
