/**
 * IndexNow submission (S15.8) — near-instant indexing on deploy.
 *
 * IndexNow lets a site tell participating engines (Bing, Yandex, and via Cloudflare's crawler-hints
 * integration, more) that URLs changed, instead of waiting for a crawl. This script:
 *   - writes the key-ownership file (`<key>.txt`) into dist/ so engines can verify the key, and
 *   - POSTs the current sitemap URLs to the IndexNow endpoint.
 *
 * The key comes from `INDEXNOW_KEY` (set in the Cloudflare Pages deploy env). Without it, or with
 * `--dry-run`, the script does everything EXCEPT the network call and prints the exact payload — so
 * CI and local builds exercise the submission logic without pinging anything.
 *
 * Wire-up: the Cloudflare Pages deploy runs `node scripts/indexnow.mjs` after publishing (see
 * docs/seo-measurement.md). Cloudflare also forwards IndexNow as crawler hints automatically.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE_URL = 'https://mcpfold.com';
const HOST = 'mcpfold.com';
const ENDPOINT = 'https://api.indexnow.org/indexnow';

/** Extract <loc> URLs from a sitemap or sitemap-index XML string. */
export function locsFromXml(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

/** Collect every page URL from the sitemap index + its child sitemaps under dist/. */
export function collectUrls(dist) {
  const indexPath = join(dist, 'sitemap.xml');
  if (!existsSync(indexPath)) return [];
  const index = readFileSync(indexPath, 'utf8');
  const locs = locsFromXml(index);
  // A sitemap index points at child sitemaps; a plain urlset points at pages directly.
  const isIndex = index.includes('<sitemapindex');
  if (!isIndex) return locs;
  const urls = [];
  for (const loc of locs) {
    const rel = loc.replace(`${SITE_URL}/`, '');
    const child = join(dist, rel);
    if (existsSync(child)) urls.push(...locsFromXml(readFileSync(child, 'utf8')));
  }
  return urls;
}

/** Build the IndexNow POST body for a set of URLs. */
export function buildPayload(urls, key) {
  return {
    host: HOST,
    key,
    keyLocation: `${SITE_URL}/${key}.txt`,
    urlList: urls,
  };
}

// --- Run --------------------------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('indexnow.mjs')) {
  const here = dirname(fileURLToPath(import.meta.url));
  const dist = join(here, '..', 'dist');
  const dryRun = process.argv.includes('--dry-run');
  const key = process.env.INDEXNOW_KEY;

  const urls = collectUrls(dist);
  if (urls.length === 0) {
    console.error('✗ no sitemap URLs found under dist/ — run the build first.');
    process.exit(1);
  }

  if (!key) {
    console.log(
      `ℹ INDEXNOW_KEY not set — skipping submission of ${urls.length} URLs (set it in the deploy env). Run with --dry-run to preview the payload.`,
    );
    if (dryRun) console.log(JSON.stringify(buildPayload(urls, 'YOUR_KEY'), null, 2));
    process.exit(0);
  }

  // Ownership file so engines can verify the key.
  writeFileSync(join(dist, `${key}.txt`), key);
  const payload = buildPayload(urls, key);

  if (dryRun) {
    console.log(`ℹ dry-run — would POST ${urls.length} URLs to ${ENDPOINT}:`);
    console.log(JSON.stringify(payload, null, 2));
    process.exit(0);
  }

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    console.error(`✗ IndexNow returned ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  console.log(`✓ IndexNow: submitted ${urls.length} URLs (${res.status})`);
}
