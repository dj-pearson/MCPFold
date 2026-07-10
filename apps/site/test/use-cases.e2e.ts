import { expect, test } from '@playwright/test';
import { allSitemaps } from './_sitemap';

/**
 * S13.11 — use-case / persona pages. Proves the /use-cases index and each /use-cases/<persona> page
 * serve tailored copy, the CORRECT CTA routing (solo → install, teams → pricing, power users →
 * directory), an ItemList/BreadcrumbList, and correct meta in the initial HTML (no JS); that the
 * homepage persona teaser links resolve to these pages; and sitemap membership. Runs against `vite
 * preview` of the built dist/ (see playwright.prerender.config.ts).
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

/** Grab the hrefs inside the CTA button row of a persona page. */
function ctaHrefs(html: string): string[] {
  const section = /data-testid="use-case-cta"[\s\S]*?<\/div>/.exec(html);
  if (!section) return [];
  return [...section[0].matchAll(/href="([^"]+)"/g)].map((m) => m[1]!);
}

test('/use-cases: index lists the personas with an ItemList (no-JS)', async ({ request }) => {
  const html = await rawHtml(request, '/use-cases');
  expect(html).toContain('Who mcpfold is for');
  expect(html).toContain('<title>Who mcpfold is for');
  expect(html).not.toMatch(/<div id="root"><\/div>/);

  const list = jsonLdBlocks(html).find((b) => b['@type'] === 'ItemList');
  expect(list, 'ItemList JSON-LD on the use-cases index').toBeTruthy();
  const items = list!.itemListElement as Array<Record<string, unknown>>;
  expect(items.length).toBe(3);
});

test('/use-cases/solo: tailored copy routes to install (no-JS)', async ({ request }) => {
  const html = await rawHtml(request, '/use-cases/solo');
  expect(html).toContain('mcpfold for solo developers');
  expect(html).toContain('<title>mcpfold for solo developers');
  expect(html).toContain('data-testid="use-case-highlights"');
  // Solo persona's primary CTA is install.
  expect(ctaHrefs(html)).toContain('/install');

  const crumb = jsonLdBlocks(html).find((b) => b['@type'] === 'BreadcrumbList');
  expect(crumb, 'breadcrumb').toBeTruthy();
  expect((crumb!.itemListElement as Array<Record<string, unknown>>)[0]!.name).toBe('Use cases');
});

test('/use-cases/teams: repo-committed wedge routes to pricing, respects non-goals (no-JS)', async ({
  request,
}) => {
  const html = await rawHtml(request, '/use-cases/teams');
  expect(html).toContain('mcpfold for teams');
  // The team wedge (E12) copy is present.
  expect(html).toContain('mcpfold diff --check');
  expect(html.toLowerCase()).toContain('repo-committed');
  // Non-goal: NOT a hosted enterprise gateway; values never synced.
  expect(html).toContain('not a hosted enterprise MCP gateway');
  expect(html.toLowerCase()).toContain('never secret values');
  // Team persona's primary CTA is pricing.
  expect(ctaHrefs(html)).toContain('/pricing');
});

test('/use-cases/power-users: routes to the directory (no-JS)', async ({ request }) => {
  const html = await rawHtml(request, '/use-cases/power-users');
  expect(html).toContain('mcpfold for power users');
  expect(ctaHrefs(html)).toContain('/directory');
});

test('the homepage persona teaser links to the persona pages', async ({ request }) => {
  const home = await rawHtml(request, '/');
  for (const id of ['solo', 'teams', 'power-users']) {
    expect(home, `homepage teaser links to /use-cases/${id}`).toContain(`/use-cases/${id}`);
  }
});

test('every persona page is in the sitemap', async ({ request }) => {
  const sitemap = await allSitemaps(request);
  expect(sitemap).toContain('https://mcpfold.com/use-cases');
  for (const id of ['solo', 'teams', 'power-users']) {
    expect(sitemap, `sitemap lists /use-cases/${id}`).toContain(`/use-cases/${id}`);
  }
});
