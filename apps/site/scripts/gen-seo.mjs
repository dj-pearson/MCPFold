/**
 * Post-build SEO generation (S13.1): writes dist/sitemap.xml for every marketing route. robots.txt
 * ships from public/. Keep ROUTES in sync as E13 pages land; a route missing here just won't be in
 * the sitemap (no build break).
 */
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE_URL = 'https://mcpfold.com';
const ROUTES = ['/'];

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
if (!existsSync(dist)) {
  console.error('✗ dist/ not found — run `vite build` first.');
  process.exit(1);
}

const urls = ROUTES.map((r) => `  <url>\n    <loc>${SITE_URL}${r}</loc>\n  </url>`).join('\n');
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
writeFileSync(join(dist, 'sitemap.xml'), sitemap);
console.log(`✓ wrote dist/sitemap.xml (${ROUTES.length} route(s))`);
