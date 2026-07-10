import { expect, test } from '@playwright/test';
import { buildPayload, collectUrls, locsFromXml } from '../scripts/indexnow.mjs';

/**
 * S15.8 — technical SEO at scale. Proves the built dist/ has: a valid sitemap INDEX referencing typed
 * child sitemaps (each with lastmod), a per-page OG card wired into og:image, correct robots/canonical
 * at scale, and that the IndexNow submission payload builds from the real sitemap (mocked — no
 * network). Runs against `vite preview` of the built dist/ (see playwright.prerender.config.ts).
 */

const SITE = 'https://mcpfold.com';

async function rawText(request: import('@playwright/test').APIRequestContext, path: string) {
  const res = await request.get(path);
  expect(res.status(), `GET ${path}`).toBe(200);
  return res.text();
}

test('sitemap.xml is a sitemap index that references typed child sitemaps with lastmod', async ({
  request,
}) => {
  const index = await rawText(request, '/sitemap.xml');
  expect(index).toContain('<sitemapindex');
  expect(index).toContain('<lastmod>');
  const children: string[] = locsFromXml(index);
  // Typed sitemaps we always expect on any branch.
  expect(children.some((c) => c.endsWith('/sitemap-core.xml'))).toBe(true);
  expect(children.some((c) => c.endsWith('/sitemap-directory.xml'))).toBe(true);

  // Every referenced child sitemap resolves and is a urlset with lastmod'd entries.
  for (const child of children) {
    const body = await rawText(request, child.replace(SITE, ''));
    expect(body, `${child} is a urlset`).toContain('<urlset');
    expect(body, `${child} has lastmod`).toContain('<lastmod>');
    expect(body).toContain('<loc>');
  }
});

test('every prerendered page appears exactly once across the typed sitemaps', async ({
  request,
}) => {
  const index = await rawText(request, '/sitemap.xml');
  const all: string[] = [];
  const children: string[] = locsFromXml(index);
  for (const child of children) {
    const locs: string[] = locsFromXml(await rawText(request, child.replace(SITE, '')));
    all.push(...locs);
  }
  expect(all.length).toBeGreaterThan(50);
  expect(new Set(all).size, 'no duplicate URLs across typed sitemaps').toBe(all.length);
  expect(all).toContain(`${SITE}/`);
  expect(all).toContain(`${SITE}/directory`);
});

test('each page has its own generated OG card wired into og:image (not the static baseline)', async ({
  request,
}) => {
  // The directory page's OG image points at its own per-page card, not a single shared og.png.
  const html = await rawText(request, '/directory');
  const m = /<meta property="og:image" content="([^"]+)"/.exec(html);
  expect(m, 'og:image present').toBeTruthy();
  const ogUrl = m![1]!;
  expect(ogUrl).toContain('/og/directory.svg');
  // twitter:image matches.
  expect(html).toContain('name="twitter:image" content="' + ogUrl + '"');
  // The card actually exists and is an SVG naming the page.
  const svg = await rawText(request, ogUrl.replace(SITE, ''));
  expect(svg).toContain('<svg');
  expect(svg.toLowerCase()).toContain('mcp server');
  // The homepage gets its own card too.
  const home = await rawText(request, '/');
  expect(home).toContain('/og/index.svg');
});

test('robots.txt points at the sitemap index and AI crawlers stay allowed at scale', async ({
  request,
}) => {
  const robots = await rawText(request, '/robots.txt');
  expect(robots).toContain('Sitemap: https://mcpfold.com/sitemap.xml');
  for (const bot of ['GPTBot', 'ClaudeBot']) expect(robots).toContain(`User-agent: ${bot}`);
});

test('IndexNow payload builds from the real sitemap (mocked, no network)', async () => {
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  const urls: string[] = collectUrls(dist);
  expect(
    urls.length,
    'collectUrls walks the sitemap index → child sitemaps → page URLs',
  ).toBeGreaterThan(50);
  expect(urls).toContain(`${SITE}/`);

  const payload = buildPayload(urls, 'testkey123');
  expect(payload.host).toBe('mcpfold.com');
  expect(payload.key).toBe('testkey123');
  expect(payload.keyLocation).toBe(`${SITE}/testkey123.txt`);
  expect(payload.urlList).toEqual(urls);
});
