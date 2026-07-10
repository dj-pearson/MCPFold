import { expect, test } from '@playwright/test';
import { compute, FIXTURE_SERVERS } from '../src/benchmark/model';

/**
 * S13.10 — feature deep-dive pages. Proves the /features index and each /features/<pillar> page serve
 * their H1, a concrete example, doc links, TechArticle structured data, and correct meta in the
 * initial HTML (no JS), that pages cross-link and are in the sitemap, and — critically — that the
 * numbers on the tool-curation page match the COMMITTED benchmark model (no drift). Runs against
 * `vite preview` of the built dist/ (see playwright.prerender.config.ts).
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

test('/features: index lists the four pillars with an ItemList (no-JS)', async ({ request }) => {
  const html = await rawHtml(request, '/features');
  expect(html).toContain('What mcpfold does');
  expect(html).toContain('<title>Features — what mcpfold does');
  expect(html).not.toMatch(/<div id="root"><\/div>/);

  const list = jsonLdBlocks(html).find((b) => b['@type'] === 'ItemList');
  expect(list, 'ItemList JSON-LD on the features index').toBeTruthy();
  const items = list!.itemListElement as Array<Record<string, unknown>>;
  expect(items.length).toBe(4);
  for (const id of ['one-config', 'tool-curation', 'secrets', 'sync-drift']) {
    expect(
      items.some((i) => String(i.url).endsWith(`/features/${id}`)),
      id,
    ).toBe(true);
  }
});

test('/features/one-config: H1 + example + doc links + TechArticle + breadcrumb (no-JS)', async ({
  request,
}) => {
  const html = await rawHtml(request, '/features/one-config');
  expect(html).toContain('One config, folded out to every client');
  expect(html).toContain('<title>One MCP config for every client — mcpfold</title>');
  // Concrete example is server-rendered, including the format-trap detail.
  expect(html).toContain('data-testid="feature-example"');
  expect(html).toContain('mcpfold sync');
  expect(html).toContain('context_servers');
  // Links to the deep docs + cross-links to related features.
  expect(html).toContain('/docs/config-format.html');
  expect(html).toContain('/features/tool-curation');

  const blocks = jsonLdBlocks(html);
  expect(
    blocks.find((b) => b['@type'] === 'TechArticle'),
    'TechArticle',
  ).toBeTruthy();
  const crumb = blocks.find((b) => b['@type'] === 'BreadcrumbList');
  expect(crumb, 'breadcrumb').toBeTruthy();
  expect((crumb!.itemListElement as Array<Record<string, unknown>>)[0]!.name).toBe('Features');
});

test('/features/tool-curation: the numbers match the committed benchmark model (no drift)', async ({
  request,
}) => {
  const html = await rawHtml(request, '/features/tool-curation');
  const bench = compute(FIXTURE_SERVERS, 3); // the committed published fixture

  // Tool counts + reduction % shown on the page come from the same model the docs publish.
  expect(bench.toolsBefore).toBe(45);
  expect(bench.toolsAfter).toBe(9);
  expect(html).toContain(String(bench.toolsBefore));
  expect(html).toContain(String(bench.toolsAfter));
  expect(html).toContain(`${bench.reductionPct}%`);
  expect(html).toContain(bench.tokensBefore.toLocaleString('en-US'));
  expect(html).toContain(bench.tokensAfter.toLocaleString('en-US'));
});

test('every feature page is in the sitemap', async ({ request }) => {
  const sitemap = await rawHtml(request, '/sitemap.xml');
  expect(sitemap).toContain('https://mcpfold.com/features');
  for (const id of ['one-config', 'tool-curation', 'secrets', 'sync-drift']) {
    expect(sitemap, `sitemap lists /features/${id}`).toContain(`/features/${id}`);
  }
});
