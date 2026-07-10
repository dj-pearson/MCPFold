/**
 * Post-build static generation (S15.1; SEO-at-scale S15.8, extends S13.1/S13.5/S13.7).
 *
 * Renders the REAL HTML for every marketing route at build time — not just <title>/meta swaps on an
 * empty SPA shell — so non-JS crawlers and AI answer engines get full content. It:
 *   1. imports the SSR bundle (dist-ssr/entry-server.js, built by `vite build --ssr`),
 *   2. for each route, renders the app to HTML, reconciles the per-route <title>/description/OG/
 *      canonical (single source of truth: resolveMeta), injects per-page-type JSON-LD, and writes a
 *      per-page OG card (dist/og/<route>.svg) wired into og:image / twitter:image,
 *   3. writes dist/<route>/index.html (the client hydrates it in place),
 *   4. AUDITS every route (S15.8): fails the build on a route missing/duplicating meta or a
 *      keyword→page target that isn't a real route (index-bloat + dead-tracking guard),
 *   5. regenerates feed.xml (blog RSS) and a scaled sitemap index + typed child sitemaps w/ lastmod.
 * robots.txt ships from public/.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import { DIRECTORY } from '../../../packages/core/dist/index.js';
import { renderOgSvg, ogPathForRoute } from './gen-og.mjs';
import { auditMeta, validateKeywordPages } from './seo-audit.mjs';

const SITE_URL = 'https://mcpfold.com';
// Deterministic-per-build lastmod. sitemap.xml lives in dist/ (gitignored), so this never drifts a
// committed file; it reflects when the site was last built/deployed.
const BUILD_DATE = new Date().toISOString().slice(0, 10);
const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', 'dist');
const ssrEntry = join(here, '..', 'dist-ssr', 'entry-server.js');
if (!existsSync(dist)) {
  console.error('✗ dist/ not found — run `vite build` first.');
  process.exit(1);
}
if (!existsSync(ssrEntry)) {
  console.error('✗ dist-ssr/entry-server.js not found — run `vite build --ssr` first.');
  process.exit(1);
}

const { render, allRoutes, mappedPaths } = await import(pathToFileURL(ssrEntry).href);

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// --- Prerender every route into its own index.html + per-page OG card ------------------------
const shell = readFileSync(join(dist, 'index.html'), 'utf8');

/** Reconcile <head> SEO tags + inject JSON-LD + the rendered app body into the built shell. */
function pageHtml(route, meta, appHtml, jsonLd, ogUrl) {
  return shell
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(meta.title)}</title>`)
    .replace(/(<meta\s+name="description"\s+content=")[\s\S]*?(")/, `$1${esc(meta.description)}$2`)
    .replace(/(<meta property="og:title" content=")[\s\S]*?(")/, `$1${esc(meta.title)}$2`)
    .replace(
      /(<meta\s+property="og:description"\s+content=")[\s\S]*?(")/,
      `$1${esc(meta.description)}$2`,
    )
    .replace(/(<meta property="og:url" content=")[\s\S]*?(")/, `$1${esc(meta.canonical)}$2`)
    .replace(/(<meta property="og:image" content=")[\s\S]*?(")/, `$1${esc(ogUrl)}$2`)
    .replace(/(<meta name="twitter:title" content=")[\s\S]*?(")/, `$1${esc(meta.title)}$2`)
    .replace(
      /(<meta\s+name="twitter:description"\s+content=")[\s\S]*?(")/,
      `$1${esc(meta.description)}$2`,
    )
    .replace(/(<meta name="twitter:image" content=")[\s\S]*?(")/, `$1${esc(ogUrl)}$2`)
    .replace(/(<link rel="canonical" href=")[\s\S]*?(")/, `$1${esc(meta.canonical)}$2`)
    .replace('</head>', `${jsonLd}</head>`)
    .replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`);
}

const routes = allRoutes();
const metaByRoute = [];
for (const route of routes) {
  const { appHtml, meta, jsonLd } = render(route);
  metaByRoute.push({ route, meta });

  // Per-page OG card, wired into this page's og:image / twitter:image.
  const ogRel = ogPathForRoute(route);
  const ogOut = join(dist, ogRel);
  mkdirSync(dirname(ogOut), { recursive: true });
  writeFileSync(ogOut, renderOgSvg({ title: meta.title }));
  const ogUrl = `${SITE_URL}/${ogRel}`;

  const html = pageHtml(route, meta, appHtml, jsonLd, ogUrl);
  // "/" writes dist/index.html; "/x/y" writes dist/x/y/index.html.
  const outDir = route === '/' ? dist : join(dist, ...route.split('/').filter(Boolean));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'index.html'), html);
}

// Branded 404 (S13.17): render the catch-all NotFound and write dist/404.html, which Cloudflare Pages
// serves with a real 404 status for unmatched paths. Not in allRoutes/sitemap and not audited.
{
  const { appHtml, meta, jsonLd } = render('/404');
  const ogRel = ogPathForRoute('/404');
  mkdirSync(dirname(join(dist, ogRel)), { recursive: true });
  writeFileSync(join(dist, ogRel), renderOgSvg({ title: meta.title }));
  writeFileSync(
    join(dist, '404.html'),
    pageHtml('/404', meta, appHtml, jsonLd, `${SITE_URL}/${ogRel}`),
  );
}

// --- Technical-SEO guards (S15.8): fail the build on meta/tracking problems ------------------
const problems = [
  ...auditMeta(metaByRoute, { siteUrl: SITE_URL }),
  ...validateKeywordPages(mappedPaths(), routes),
];
if (problems.length > 0) {
  console.error(`✗ SEO audit failed (${problems.length}):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}

// --- Blog: read the same markdown the site renders → RSS feed (S13.7) -----------------------
const blogDir = join(here, '..', 'content', 'blog');
const posts = (existsSync(blogDir) ? readdirSync(blogDir) : [])
  .filter((f) => f.endsWith('.md'))
  .map((f) => {
    const raw = readFileSync(join(blogDir, f), 'utf8');
    const m = /^---\n([\s\S]*?)\n---/.exec(raw);
    const meta = {};
    if (m) {
      for (const line of m[1].split('\n')) {
        const i = line.indexOf(':');
        if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
      }
    }
    return {
      slug: f.replace(/\.md$/, ''),
      title: meta.title ?? f,
      date: meta.date ?? '',
      description: meta.description ?? '',
    };
  })
  .sort((a, b) => b.date.localeCompare(a.date));

const items = posts
  .map(
    (p) =>
      `    <item>\n      <title>${esc(p.title)}</title>\n      <link>${SITE_URL}/blog/${p.slug}</link>\n      <guid>${SITE_URL}/blog/${p.slug}</guid>\n      <description>${esc(p.description)}</description>\n      <pubDate>${p.date}</pubDate>\n    </item>`,
  )
  .join('\n');
writeFileSync(
  join(dist, 'feed.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n  <channel>\n    <title>mcpfold blog</title>\n    <link>${SITE_URL}/blog</link>\n    <description>Launches, deep-dives, and release notes from mcpfold.</description>\n${items}\n  </channel>\n</rss>\n`,
);

// --- Sitemap at scale (S15.8): a sitemap index + typed child sitemaps, each with lastmod --------
// Classify every route into a typed bucket by its first segment so the sitemap scales cleanly as
// pSEO multiplies pages. New page types (guides/glossary/compare) slot in automatically.
function sitemapBucket(route) {
  if (route.startsWith('/directory/category/')) return 'categories';
  if (route.startsWith('/directory')) return 'directory';
  if (route.startsWith('/blog')) return 'blog';
  if (route.startsWith('/guides')) return 'guides';
  if (route.startsWith('/glossary')) return 'glossary';
  if (route.startsWith('/compare')) return 'compare';
  return 'core';
}

const buckets = new Map();
for (const route of routes) {
  const b = sitemapBucket(route);
  if (!buckets.has(b)) buckets.set(b, []);
  buckets.get(b).push(route);
}

const childSitemaps = [];
for (const [name, group] of [...buckets].sort((a, b) => a[0].localeCompare(b[0]))) {
  const urls = group
    .map(
      (r) =>
        `  <url>\n    <loc>${SITE_URL}${r}</loc>\n    <lastmod>${BUILD_DATE}</lastmod>\n  </url>`,
    )
    .join('\n');
  const file = `sitemap-${name}.xml`;
  writeFileSync(
    join(dist, file),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
  );
  childSitemaps.push(file);
}

// The sitemap index that robots.txt points at.
const indexEntries = childSitemaps
  .map(
    (f) =>
      `  <sitemap>\n    <loc>${SITE_URL}/${f}</loc>\n    <lastmod>${BUILD_DATE}</lastmod>\n  </sitemap>`,
  )
  .join('\n');
writeFileSync(
  join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexEntries}\n</sitemapindex>\n`,
);

console.log(
  `✓ prerendered ${routes.length} routes (${DIRECTORY.length} directory, ${posts.length} blog) + ${routes.length} OG cards + feed.xml + sitemap index (${childSitemaps.length} typed sitemaps)`,
);
