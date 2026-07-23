import { expect, test } from '@playwright/test';
import { allSitemaps } from './_sitemap';

/**
 * S13.17 — 404 / error pages, redirects, and brand kit. Proves an unknown URL serves the branded
 * 404.html with a real 404 status and helpful links; the /brand press kit renders with downloadable
 * assets, colors, the one-liner, and the no-endorsement note; and the _redirects legacy map ships.
 * Runs against `vite preview` (serve-static.mjs) of the built dist/ — which mirrors Cloudflare Pages
 * by serving dist/404.html on a miss (see playwright.prerender.config.ts).
 */

async function get(request: import('@playwright/test').APIRequestContext, path: string) {
  return request.get(path);
}
async function rawHtml(request: import('@playwright/test').APIRequestContext, path: string) {
  const res = await get(request, path);
  expect(res.status(), `GET ${path}`).toBe(200);
  return res.text();
}

test('an unknown URL serves the branded 404 with a 404 status + helpful links (no-JS)', async ({
  request,
}) => {
  const res = await get(request, '/this-page-does-not-exist-xyz');
  expect(res.status(), 'unmatched path returns 404').toBe(404);
  const html = await res.text();
  expect(html).toContain('data-testid="notfound-heading"');
  expect(html).toContain('This page folded away');
  expect(html).toContain('<title>Page not found — mcpfold</title>');
  // Helpful navigation back into the site.
  expect(html).toContain('data-testid="notfound-links"');
  for (const href of ['/install', '/directory', '/docs']) {
    expect(html, `404 links to ${href}`).toContain(`"${href}"`);
  }
});

test('/brand: downloadable assets + colors + one-liner + no-endorsement (no-JS)', async ({
  request,
}) => {
  const html = await rawHtml(request, '/brand');
  expect(html).toContain('Brand &amp; press kit');
  expect(html).toContain('<title>Brand &amp; press kit — mcpfold</title>');
  expect(html).toContain('data-testid="brand-oneliner"');
  expect(html).toContain('data-testid="brand-colors"');
  expect(html).toContain('#3b5bdb'); // the accent token (WCAG AA tuned)
  // Download links to the real asset files.
  expect(html).toContain('/brand/mcpfold-wordmark.svg');
  expect(html).toContain('/brand/mcpfold-logomark.svg');
  expect(html).toContain('download');
  // No-endorsement.
  expect(html).toContain('not affiliated with or endorsed by the MCP project');
});

test('the brand assets actually download (200 + svg)', async ({ request }) => {
  for (const asset of ['/brand/mcpfold-wordmark.svg', '/brand/mcpfold-logomark.svg']) {
    const res = await get(request, asset);
    expect(res.status(), `GET ${asset}`).toBe(200);
    expect(await res.text(), `${asset} is an SVG`).toContain('<svg');
  }
});

test('/brand is in the sitemap + footer; the _redirects legacy map ships', async ({ request }) => {
  const home = await rawHtml(request, '/');
  expect(home).toContain('href="/brand"');
  const sitemap = await allSitemaps(request);
  expect(sitemap).toContain('https://mcpfold.com/brand');
  // The 404 page is NOT in the sitemap (it's not an indexable destination).
  expect(sitemap).not.toContain('mcpfold.com/404');

  // The redirect map is deployed with the documented legacy rules + the no-SPA-fallback note.
  const redirects = await rawHtml(request, '/_redirects');
  expect(redirects).toContain('/servers');
  expect(redirects).toContain('/directory');
  expect(redirects).toContain('301');
  expect(redirects).not.toContain('/*    /index.html    200');
});
