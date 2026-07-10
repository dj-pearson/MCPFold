import { expect, test } from '@playwright/test';
import { allSitemaps } from './_sitemap';

/**
 * S15.7 — comparison / alternatives pages. Proves the /compare hub and each /compare/<id> page serve
 * their comparison table, TechArticle structured data, correct titles, and internal links in the
 * initial HTML (no JS), that pages are in the sitemap, and that the honest-positioning copy (what
 * mcpfold is NOT, per the PRD non-goals) is actually present. Runs against `vite preview` of the
 * built dist/ (see playwright.prerender.config.ts).
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

test('/compare: hub lists comparisons with an ItemList in no-JS HTML', async ({ request }) => {
  const html = await rawHtml(request, '/compare');
  expect(html).toContain('How mcpfold compares');
  expect(html).toContain('<title>How mcpfold compares');
  expect(html).not.toMatch(/<div id="root"><\/div>/);

  const list = jsonLdBlocks(html).find((b) => b['@type'] === 'ItemList');
  expect(list, 'ItemList JSON-LD on the compare hub').toBeTruthy();
  const items = list!.itemListElement as Array<Record<string, unknown>>;
  expect(items.length).toBeGreaterThanOrEqual(2);
});

test('/compare/manual-vs-mcpfold: table + TechArticle + breadcrumb (no-JS)', async ({
  request,
}) => {
  const html = await rawHtml(request, '/compare/manual-vs-mcpfold');
  expect(html).toContain('Managing MCP servers by hand vs mcpfold');
  expect(html).toContain('<title>Managing MCP servers by hand vs mcpfold');
  // The comparison table is server-rendered with its column headers and a dimension row.
  expect(html).toContain('data-testid="compare-table"');
  expect(html).toContain('By hand');
  expect(html).toContain('Source of truth');

  const blocks = jsonLdBlocks(html);
  const article = blocks.find((b) => b['@type'] === 'TechArticle');
  expect(article, 'TechArticle JSON-LD').toBeTruthy();
  expect(String(article!.headline)).toContain('by hand vs mcpfold');

  const crumb = blocks.find((b) => b['@type'] === 'BreadcrumbList');
  expect(crumb, 'BreadcrumbList JSON-LD').toBeTruthy();
  const trail = crumb!.itemListElement as Array<Record<string, unknown>>;
  expect(trail[0]!.name).toBe('Compare');
});

test('/compare/mcp-config-manager: honest positioning respects the non-goals (no-JS)', async ({
  request,
}) => {
  const html = await rawHtml(request, '/compare/mcp-config-manager');
  expect(html).toContain('MCP config manager');
  // Three-way table names the hosted-gateway category factually.
  expect(html).toContain('Hosted MCP gateway');
  // Positioning is explicit about what mcpfold is NOT (PRD non-goal: not an enterprise gateway).
  expect(html.toLowerCase()).toContain('local-first');
  expect(html).toContain('not a hosted gateway');
  // Secret non-goal: values are never synced.
  expect(html.toLowerCase()).toContain('values never synced');
});

test('every comparison page is in the sitemap', async ({ request }) => {
  const sitemap = await allSitemaps(request);
  expect(sitemap).toContain('https://mcpfold.com/compare');
  for (const id of ['manual-vs-mcpfold', 'mcp-config-manager']) {
    expect(sitemap, `sitemap lists /compare/${id}`).toContain(`/compare/${id}`);
  }
});
