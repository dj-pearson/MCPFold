import { expect, test } from '@playwright/test';
import { allSitemaps } from './_sitemap';

/**
 * S13.14 — legal & policy pages. Proves /privacy, /terms, and /analytics render (dated + versioned)
 * in the initial HTML (no JS), that the privacy/analytics copy matches the ACTUAL behavior (cookieless
 * no-PII analytics, opt-in CLI telemetry honoring DO_NOT_TRACK, references-never-values, no cookie
 * wall), that all three are footer-linked and in the sitemap, and each carries a breadcrumb. Runs
 * against `vite preview` of the built dist/ (see playwright.prerender.config.ts).
 */

async function rawHtml(request: import('@playwright/test').APIRequestContext, path: string) {
  const res = await request.get(path);
  expect(res.status(), `GET ${path}`).toBe(200);
  return res.text();
}

function jsonLdBlocks(html: string): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [];
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) blocks.push(JSON.parse(m[1]!));
  return blocks;
}

test('/privacy: dated policy reflecting the real analytics + telemetry behavior (no-JS)', async ({
  request,
}) => {
  const html = await rawHtml(request, '/privacy');
  expect(html).toContain('Privacy policy');
  expect(html).toContain('<title>Privacy policy — mcpfold</title>');
  expect(html).not.toMatch(/<div id="root"><\/div>/);
  // Dated + versioned (React inserts a <!-- --> text separator before interpolated values).
  expect(html).toContain('data-testid="legal-effective"');
  expect(html).toMatch(/Version(\s|<!-- -->)*1\.0/);
  expect(html).toContain('Effective ');
  expect(html).toContain('2026-07-10');

  // Consistency with the real implementation.
  expect(html.toLowerCase()).toContain('cookieless');
  expect(html).toContain('collects nothing by default');
  expect(html).toContain('MCPFOLD_TELEMETRY=1');
  expect(html).toContain('DO_NOT_TRACK=1');
  // References-never-values invariant.
  expect(html).toContain('never the secret values');

  expect(
    jsonLdBlocks(html).find((b) => b['@type'] === 'BreadcrumbList'),
    'breadcrumb',
  ).toBeTruthy();
});

test('/terms: MIT-licensed software + as-is service + no-endorsement (no-JS)', async ({
  request,
}) => {
  const html = await rawHtml(request, '/terms');
  expect(html).toContain('Terms of use');
  expect(html).toContain('MIT license');
  expect(html).toContain('as-is');
  expect(html).toContain('not affiliated with or endorsed by the MCP project');
});

test('/analytics: cookieless disclosure that states there is no cookie wall (no-JS)', async ({
  request,
}) => {
  const html = await rawHtml(request, '/analytics');
  expect(html).toContain('Analytics &amp; cookie disclosure');
  expect(html.toLowerCase()).toContain('no cookie wall');
  expect(html).toContain('no cookies');
  expect(html.toLowerCase()).toContain('do-not-track');
});

test('the three legal pages are footer-linked and in the sitemap', async ({ request }) => {
  const home = await rawHtml(request, '/');
  for (const path of ['/privacy', '/terms', '/analytics']) {
    expect(home, `footer links to ${path}`).toContain(`href="${path}"`);
  }
  const sitemap = await allSitemaps(request);
  for (const path of ['/privacy', '/terms', '/analytics']) {
    expect(sitemap, `sitemap lists ${path}`).toContain(`https://mcpfold.com${path}`);
  }
});
