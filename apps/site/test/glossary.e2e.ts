import { expect, test } from '@playwright/test';
import { allSitemaps } from './_sitemap';

/**
 * S15.6 — glossary / concept hub. Proves the /glossary hub and each /glossary/<term> page serve their
 * leading definition, DefinedTerm(Set) structured data, and internal links in the initial HTML (no
 * JS), and that every concept page is in the sitemap. Runs against `vite preview` of the built dist/
 * (see playwright.prerender.config.ts).
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

test('/glossary: hub lists terms with a DefinedTermSet in no-JS HTML', async ({ request }) => {
  const html = await rawHtml(request, '/glossary');
  expect(html).toContain('MCP glossary');
  expect(html).toContain('<title>MCP glossary');
  expect(html).not.toMatch(/<div id="root"><\/div>/);

  const set = jsonLdBlocks(html).find((b) => b['@type'] === 'DefinedTermSet');
  expect(set, 'DefinedTermSet JSON-LD on the hub').toBeTruthy();
  const terms = set!.hasDefinedTerm as Array<Record<string, unknown>>;
  expect(terms.length).toBeGreaterThanOrEqual(7);
  expect(terms.some((t) => String(t.url).endsWith('/glossary/mcp-server'))).toBe(true);
});

test('/glossary/:term: leading definition + DefinedTerm + breadcrumb (no-JS)', async ({
  request,
}) => {
  const html = await rawHtml(request, '/glossary/mcp-server');
  // The extractable definition is server-rendered, not just in the SPA.
  expect(html).toContain('What is an MCP server?');
  expect(html).toContain('An MCP server is a program that exposes tools');
  expect(html).toContain('<title>What is an MCP server? · mcpfold glossary</title>');
  // Outbound internal links down to the product graph.
  expect(html).toContain('/directory');

  const blocks = jsonLdBlocks(html);
  const term = blocks.find((b) => b['@type'] === 'DefinedTerm');
  expect(term, 'DefinedTerm JSON-LD').toBeTruthy();
  expect(term!.name).toBe('MCP server');
  expect(String(term!.inDefinedTermSet)).toContain('/glossary');

  const crumb = blocks.find((b) => b['@type'] === 'BreadcrumbList');
  expect(crumb, 'BreadcrumbList JSON-LD').toBeTruthy();
  const trail = crumb!.itemListElement as Array<Record<string, unknown>>;
  expect(trail[0]!.name).toBe('Glossary');
  expect(String(trail[1]!.item)).toContain('/glossary/mcp-server');
});

test('the category term "MCP config manager" has its own concept page', async ({ request }) => {
  const html = await rawHtml(request, '/glossary/mcp-config-manager');
  expect(html).toContain('What is an MCP config manager?');
  expect(html.toLowerCase()).toContain('one source of truth');
});

test('every concept page is in the sitemap', async ({ request }) => {
  const sitemap = await allSitemaps(request);
  expect(sitemap).toContain('https://mcpfold.com/glossary');
  for (const id of [
    'mcp-server',
    'model-context-protocol',
    'mcp-client',
    'mcp-tools',
    'context-window',
    'secret-reference',
    'mcp-config-manager',
  ]) {
    expect(sitemap, `sitemap lists /glossary/${id}`).toContain(`/glossary/${id}`);
  }
});
