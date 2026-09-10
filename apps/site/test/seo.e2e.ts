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

test('feed.xml is valid RSS with RFC-822 dates and is advertised in <head>', async ({
  request,
}) => {
  // SEO-3: a date-only pubDate is not RSS 2.0 and readers cannot order the feed by it.
  const feed = await rawText(request, '/feed.xml');
  expect(feed).toContain('xmlns:atom="http://www.w3.org/2005/Atom"');
  expect(feed).toContain('rel="self"');
  expect(feed).toContain('<language>');
  expect(feed).toContain('<lastBuildDate>');

  const dates = [...feed.matchAll(/<(?:pubDate|lastBuildDate)>([^<]+)</g)].map((m) => m[1]!);
  expect(dates.length, 'feed carries dates').toBeGreaterThan(0);
  for (const d of dates) {
    expect(d, 'RFC-822 date').toMatch(
      /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/,
    );
    expect(Number.isNaN(Date.parse(d)), `"${d}" parses`).toBe(false);
  }

  // Autodiscovery from an arbitrary page, not just /blog.
  const html = await rawText(request, '/pricing');
  expect(html).toContain('type="application/rss+xml"');
  expect(html).toContain('/feed.xml');
});

test('sitemap lastmod is per-URL content dating, not one uniform build date', async ({
  request,
}) => {
  // SEO-1: Google discards lastmod when every URL carries the same stamp on every deploy. The dates
  // come from the last commit touching each route's source, so distinct page types must differ.
  const index = await rawText(request, '/sitemap.xml');
  const children: string[] = locsFromXml(index);
  const dates = new Set<string>();
  for (const child of children) {
    const body = await rawText(request, child.replace(SITE, ''));
    for (const m of body.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)) {
      expect(m[1], `${child} lastmod is an ISO date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      dates.add(m[1]!);
    }
  }
  expect(dates.size, 'sitemap lastmod values must vary by content, not be one build date').toBeGreaterThan(1);
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
