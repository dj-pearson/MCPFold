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
  expect(html).toMatch(/Version(\s|<!-- -->)*1\.1/);
  expect(html).toContain('Effective ');
  expect(html).toContain('2026-07-23');

  // Consistency with the real implementation.
  expect(html.toLowerCase()).toContain('cookieless');
  expect(html).toContain('collects nothing by default');
  expect(html).toContain('MCPFOLD_TELEMETRY=1');
  expect(html).toContain('DO_NOT_TRACK=1');
  // References-never-values invariant.
  expect(html).toContain('never the secret values');

  // GDPR / US-state completeness: lawful basis, DSR rights, retention, transfers, subprocessors,
  // no-sale, and children's data are all disclosed.
  expect(html).toContain('Legal bases for processing');
  expect(html.toLowerCase()).toContain('portable format');
  expect(html).toContain('International data transfers');
  expect(html).toContain('Data retention');
  expect(html).toContain('Supabase');
  expect(html).toContain('Stripe');
  expect(html).toContain('Cloudflare');
  expect(html).toContain('do not sell');
  expect(html.toLowerCase()).toContain('global privacy control');
  // Children's-data / age statement (apostrophe is HTML-escaped in the raw markup).
  expect(html).toContain('not directed to children');

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

test('/accessibility: WCAG 2.2 AA statement with a reporting path (no-JS)', async ({ request }) => {
  const html = await rawHtml(request, '/accessibility');
  expect(html).toContain('Accessibility statement');
  expect(html).toContain('<title>Accessibility statement — mcpfold</title>');
  expect(html).toContain('WCAG 2.2');
  expect(html).toContain('Level AA');
  expect(html.toLowerCase()).toContain('skip to content');
  // A concrete way to report a barrier is present.
  expect(html).toContain('Report a problem');
  expect(html).toContain('security@mcpfold.com');
});

test('the legal & accessibility pages are footer-linked and in the sitemap', async ({ request }) => {
  const home = await rawHtml(request, '/');
  for (const path of ['/privacy', '/terms', '/analytics', '/accessibility']) {
    expect(home, `footer links to ${path}`).toContain(`href="${path}"`);
  }
  const sitemap = await allSitemaps(request);
  for (const path of ['/privacy', '/terms', '/analytics', '/accessibility']) {
    expect(sitemap, `sitemap lists ${path}`).toContain(`https://mcpfold.com${path}`);
  }
});

test('no third-party analytics/marketing trackers ship in the built HTML', async ({ request }) => {
  // The privacy + analytics disclosures promise "cookieless, no third-party trackers, no cookie
  // wall". This guards that promise against regressions like a stray Google Analytics / gtag tag:
  // the shipped pages must not embed known third-party tracker hosts. First-party privacy-friendly
  // analytics is injected at runtime by src/analytics.ts and only when env-configured, so it is not
  // in the static HTML at all.
  const forbidden = [
    'googletagmanager.com',
    'google-analytics.com',
    'gtag/js',
    'connect.facebook.net',
    'fullstory.com',
    'hotjar.com',
    'segment.com',
    'mixpanel.com',
  ];
  for (const path of ['/', '/privacy', '/analytics', '/pricing', '/directory']) {
    const html = (await rawHtml(request, path)).toLowerCase();
    for (const needle of forbidden) {
      expect(html, `${path} must not embed ${needle}`).not.toContain(needle);
    }
  }
});
