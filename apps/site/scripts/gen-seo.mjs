/**
 * Post-build SEO generation (S13.1 + S13.5): writes dist/sitemap.xml for every marketing route,
 * and PRERENDERS a per-entry HTML page for each directory server — the built SPA shell with the
 * entry's title/description/OG baked in — so each server has its own crawlable, unfurlable page.
 * robots.txt ships from public/.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIRECTORY } from '../../../packages/core/dist/index.js';

const SITE_URL = 'https://mcpfold.com';
const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', 'dist');
if (!existsSync(dist)) {
  console.error('✗ dist/ not found — run `vite build` first.');
  process.exit(1);
}

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// --- Prerender per-entry directory pages ----------------------------------------------------
const shell = readFileSync(join(dist, 'index.html'), 'utf8');
for (const entry of DIRECTORY) {
  const title = `${entry.name} — MCP server · mcpfold`;
  const desc = entry.description;
  const url = `${SITE_URL}/directory/${entry.id}`;
  const html = shell
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta name="description" content=")[\s\S]*?(")/, `$1${esc(desc)}$2`)
    .replace(/(<meta property="og:title" content=")[\s\S]*?(")/, `$1${esc(title)}$2`)
    .replace(/(<meta property="og:description" content=")[\s\S]*?(")/, `$1${esc(desc)}$2`)
    .replace(/(<meta property="og:url" content=")[\s\S]*?(")/, `$1${esc(url)}$2`)
    .replace(/(<meta name="twitter:title" content=")[\s\S]*?(")/, `$1${esc(title)}$2`)
    .replace(/(<link rel="canonical" href=")[\s\S]*?(")/, `$1${esc(url)}$2`);
  const dir = join(dist, 'directory', entry.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html);
}

// --- Sitemap (static routes + every directory entry) ----------------------------------------
const ROUTES = ['/', '/install', '/directory', ...DIRECTORY.map((e) => `/directory/${e.id}`)];
const urls = ROUTES.map((r) => `  <url>\n    <loc>${SITE_URL}${r}</loc>\n  </url>`).join('\n');
writeFileSync(
  join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
);
console.log(
  `✓ prerendered ${DIRECTORY.length} directory pages + sitemap.xml (${ROUTES.length} routes)`,
);
