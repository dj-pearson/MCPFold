/**
 * Post-build static generation (S15.1, extends S13.1/S13.5/S13.7).
 *
 * Renders the REAL HTML for every marketing route at build time — not just <title>/meta swaps on an
 * empty SPA shell — so non-JS crawlers and AI answer engines get full content. It:
 *   1. imports the SSR bundle (dist-ssr/entry-server.js, built by `vite build --ssr`),
 *   2. for each route, renders the app to HTML, reconciles the per-route <title>/description/OG/
 *      canonical (single source of truth: resolveMeta) and injects per-page-type JSON-LD,
 *   3. writes dist/<route>/index.html (the client hydrates it in place),
 *   4. regenerates feed.xml (blog RSS) and sitemap.xml.
 * robots.txt ships from public/.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import { DIRECTORY } from '../../../packages/core/dist/index.js';

const SITE_URL = 'https://mcpfold.com';
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

const { render, allRoutes } = await import(pathToFileURL(ssrEntry).href);

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// --- Prerender every route into its own index.html ------------------------------------------
const shell = readFileSync(join(dist, 'index.html'), 'utf8');

/** Reconcile <head> SEO tags + inject JSON-LD + the rendered app body into the built shell. */
function pageHtml(route) {
  const { appHtml, meta, jsonLd } = render(route);
  return shell
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(meta.title)}</title>`)
    .replace(/(<meta\s+name="description"\s+content=")[\s\S]*?(")/, `$1${esc(meta.description)}$2`)
    .replace(/(<meta property="og:title" content=")[\s\S]*?(")/, `$1${esc(meta.title)}$2`)
    .replace(
      /(<meta\s+property="og:description"\s+content=")[\s\S]*?(")/,
      `$1${esc(meta.description)}$2`,
    )
    .replace(/(<meta property="og:url" content=")[\s\S]*?(")/, `$1${esc(meta.canonical)}$2`)
    .replace(/(<meta name="twitter:title" content=")[\s\S]*?(")/, `$1${esc(meta.title)}$2`)
    .replace(
      /(<meta\s+name="twitter:description"\s+content=")[\s\S]*?(")/,
      `$1${esc(meta.description)}$2`,
    )
    .replace(/(<link rel="canonical" href=")[\s\S]*?(")/, `$1${esc(meta.canonical)}$2`)
    .replace('</head>', `${jsonLd}</head>`)
    .replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`);
}

const routes = allRoutes();
for (const route of routes) {
  const html = pageHtml(route);
  // "/" writes dist/index.html; "/x/y" writes dist/x/y/index.html.
  const outDir = route === '/' ? dist : join(dist, ...route.split('/').filter(Boolean));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'index.html'), html);
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

// --- Sitemap (every prerendered route) ------------------------------------------------------
const urls = routes.map((r) => `  <url>\n    <loc>${SITE_URL}${r}</loc>\n  </url>`).join('\n');
writeFileSync(
  join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
);
const featureCount = routes.filter((r) => r.startsWith('/features/')).length;
console.log(
  `✓ prerendered ${routes.length} routes (${DIRECTORY.length} directory, ${featureCount} features, ${posts.length} blog) + feed.xml + sitemap.xml`,
);
