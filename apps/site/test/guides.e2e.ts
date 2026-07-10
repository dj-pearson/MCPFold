import { expect, test } from '@playwright/test';
import { allSitemaps } from './_sitemap';

/**
 * S15.5 — per-client setup guides. Proves the /guides hub and each /guides/<client> page serve their
 * real content, HowTo/ItemList structured data, and correct adapter-derived config facts in the
 * initial HTML (no JS), and that every generated guide is in the sitemap. Runs against `vite preview`
 * of the built dist/ (see playwright.prerender.config.ts).
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

test('/guides: hub lists every client with an ItemList in no-JS HTML', async ({ request }) => {
  const html = await rawHtml(request, '/guides');
  expect(html).toContain('Add MCP servers to any client');
  expect(html).toContain(
    '<title>MCP setup guides — add MCP servers to any client · mcpfold</title>',
  );
  expect(html).not.toMatch(/<div id="root"><\/div>/);

  const list = jsonLdBlocks(html).find((b) => b['@type'] === 'ItemList');
  expect(list, 'ItemList JSON-LD on the guides hub').toBeTruthy();
  const items = list!.itemListElement as Array<Record<string, unknown>>;
  expect(items.length).toBeGreaterThanOrEqual(18);
  expect(items.some((i) => String(i.url).endsWith('/guides/claude-code'))).toBe(true);
});

test('/guides/:client: HowTo + breadcrumb + adapter-derived facts (no-JS)', async ({ request }) => {
  const html = await rawHtml(request, '/guides/cursor');
  // Real, server-rendered content targeting the high-intent query.
  expect(html).toContain('Add MCP servers to Cursor');
  expect(html).toContain('<title>Add MCP servers to Cursor · mcpfold</title>');
  // The copy-paste command sequence is present without JS.
  for (const cmd of ['mcpfold init', 'mcpfold sync', 'mcpfold add']) {
    expect(html, `command ${cmd}`).toContain(cmd);
  }
  // The config path comes straight from the adapter (never hand-typed).
  expect(html).toContain('/Users/you/.cursor/mcp.json');

  const blocks = jsonLdBlocks(html);
  const howTo = blocks.find((b) => b['@type'] === 'HowTo');
  expect(howTo, 'HowTo JSON-LD').toBeTruthy();
  expect(howTo!.name).toBe('Add MCP servers to Cursor');
  const steps = howTo!.step as Array<Record<string, unknown>>;
  expect(steps.length).toBeGreaterThan(1);
  expect(steps[0]!['@type']).toBe('HowToStep');
  expect(steps[0]!.position).toBe(1);

  const crumb = blocks.find((b) => b['@type'] === 'BreadcrumbList');
  expect(crumb, 'BreadcrumbList JSON-LD').toBeTruthy();
  const trail = crumb!.itemListElement as Array<Record<string, unknown>>;
  expect(trail[0]!.name).toBe('Guides');
  expect(String(trail[1]!.item)).toContain('/guides/cursor');
});

test('a client that needs a restart says so in the prerendered guide', async ({ request }) => {
  const html = await rawHtml(request, '/guides/claude-desktop');
  expect(html).toContain('Add MCP servers to Claude Desktop');
  expect(html.toLowerCase()).toContain('restart claude desktop');
});

test('every generated guide is in the sitemap', async ({ request }) => {
  const sitemap = await allSitemaps(request);
  expect(sitemap).toContain('https://mcpfold.com/guides');
  for (const id of ['claude-code', 'cursor', 'vscode', 'windsurf', 'opencode', 'copilot-cli']) {
    expect(sitemap, `sitemap lists /guides/${id}`).toContain(`/guides/${id}`);
  }
});
