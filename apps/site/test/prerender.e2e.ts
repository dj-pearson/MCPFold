import { expect, test } from '@playwright/test';

/**
 * S15.1 — true SSG. Proves every marketing route serves its real content and structured data in the
 * initial HTML (no JS), and that the same HTML hydrates cleanly. Runs against `vite preview` (the
 * built dist/), see playwright.prerender.config.ts.
 */

// A no-JS fetch: page.request.get returns the raw served HTML without executing any script.
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

test('homepage: real content + SoftwareApplication JSON-LD in no-JS HTML', async ({ request }) => {
  const html = await rawHtml(request, '/');
  // Hero/body text is present without running JS (rendered at build time).
  expect(html).toContain('one MCP config for every');
  expect(html).toContain('<title>mcpfold — one MCP config for every MCP client</title>');
  // The React root is NOT an empty shell.
  expect(html).not.toMatch(/<div id="root"><\/div>/);

  const blocks = jsonLdBlocks(html);
  const app = blocks.find((b) => b['@type'] === 'SoftwareApplication');
  expect(app, 'SoftwareApplication JSON-LD').toBeTruthy();
  expect(app!['@context']).toBe('https://schema.org');
  expect(app!.name).toBe('mcpfold');
});

test('homepage: the full narrative (S13.8) is in the prerendered no-JS HTML', async ({
  request,
}) => {
  const html = await rawHtml(request, '/');
  // How it works (static, build-time) — the command sequence is server-rendered.
  for (const cmd of ['mcpfold init', 'mcpfold import', 'mcpfold sync', 'mcpfold diff']) {
    expect(html, `how-it-works: ${cmd}`).toContain(cmd);
  }
  // Use-cases + CTA copy.
  expect(html).toContain('Who mcpfold is for');
  expect(html).toContain('Install mcpfold');
  // Credibility: MIT + the npm version sourced from the build are present without JS. The live
  // star count is client-only, so it must NOT be in the static HTML.
  expect(html).toContain('MIT license');
  expect(html).toMatch(/data-testid="npm-version">v\d+\.\d+\.\d+/);
  expect(html).not.toContain('github-stars');
});

test('/directory: heading + ItemList JSON-LD in no-JS HTML', async ({ request }) => {
  const html = await rawHtml(request, '/directory');
  expect(html).toContain('MCP server directory');

  const list = jsonLdBlocks(html).find((b) => b['@type'] === 'ItemList');
  expect(list, 'ItemList JSON-LD').toBeTruthy();
  const items = list!.itemListElement as Array<Record<string, unknown>>;
  expect(Array.isArray(items)).toBe(true);
  expect(items.length).toBeGreaterThan(0);
  expect(items[0]!['@type']).toBe('ListItem');
  expect(items[0]!.position).toBe(1);
});

test('/directory/category/:cat: prerendered collection with ItemList + in the sitemap (no-JS)', async ({
  request,
}) => {
  const html = await rawHtml(request, '/directory/category/database');
  // The collection is real, server-rendered content, not an empty shell.
  expect(html).toContain('Best Database MCP servers');
  expect(html).toContain('<title>Best Database MCP servers · mcpfold</title>');
  expect(html).not.toMatch(/<div id="root"><\/div>/);

  const blocks = jsonLdBlocks(html);
  const list = blocks.find((b) => b['@type'] === 'ItemList');
  expect(list, 'ItemList JSON-LD on the category page').toBeTruthy();
  const items = list!.itemListElement as Array<Record<string, unknown>>;
  expect(items.length).toBeGreaterThan(2); // >= MIN_CATEGORY_ENTRIES
  expect(items.some((i) => String(i.url).endsWith('/directory/postgres'))).toBe(true);
  expect(
    blocks.find((b) => b['@type'] === 'BreadcrumbList'),
    'breadcrumb',
  ).toBeTruthy();

  // The sitemap lists populated categories but not thin ones (index-bloat guard). Since S15.8 the
  // top-level sitemap.xml is a sitemap INDEX; category URLs live in the typed categories sitemap.
  const index = await rawHtml(request, '/sitemap.xml');
  expect(index).toContain('<sitemapindex');
  expect(index).toContain('/sitemap-categories.xml');
  const categories = await rawHtml(request, '/sitemap-categories.xml');
  expect(categories).toContain('/directory/category/database');
  expect(categories).not.toContain('/directory/category/finance');
});

test('/directory/:id: entry content + BreadcrumbList JSON-LD in no-JS HTML', async ({
  request,
}) => {
  const html = await rawHtml(request, '/directory/filesystem');
  // The entry's own name is server-rendered (not just a client-side lookup).
  expect(html.toLowerCase()).toContain('filesystem');
  expect(html).toContain('MCP server · mcpfold');

  const crumb = jsonLdBlocks(html).find((b) => b['@type'] === 'BreadcrumbList');
  expect(crumb, 'BreadcrumbList JSON-LD').toBeTruthy();
  const trail = crumb!.itemListElement as Array<Record<string, unknown>>;
  expect(trail[0]!.name).toBe('Directory');
  expect(String(trail[1]!.item)).toContain('/directory/filesystem');
});

test('prerendered pages hydrate with no console errors or mismatch warnings', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') problems.push(msg.text());
  });
  page.on('pageerror', (err) => problems.push(String(err)));

  for (const path of ['/', '/directory', '/directory/filesystem', '/install']) {
    await page.goto(path);
    // Wait for hydration to attach (an interactive control from the shared header).
    await expect(page.getByTestId('theme-toggle')).toBeVisible();
  }

  const hydrationIssues = problems.filter(
    (t) => /hydrat/i.test(t) || /did not match/i.test(t) || /server rendered/i.test(t),
  );
  expect(hydrationIssues, `hydration issues:\n${hydrationIssues.join('\n')}`).toEqual([]);
  expect(problems, `console problems:\n${problems.join('\n')}`).toEqual([]);
});

// ------------------------------------------------------------------------------------------------
// GEO answer layer (S15.2): llms.txt, FAQPage JSON-LD, AI-crawler robots policy
// ------------------------------------------------------------------------------------------------
test('/llms.txt and /llms-full.txt resolve with the summary + canonical links', async ({
  request,
}) => {
  const llms = await rawHtml(request, '/llms.txt');
  expect(llms).toContain('# mcpfold');
  expect(llms).toContain('mcpfold is a free, open-source CLI');
  // Canonical link map is present.
  for (const link of ['/install', '/directory', '/pricing', '/docs']) {
    expect(llms, `llms.txt links to ${link}`).toContain(`https://mcpfold.com${link}`);
  }
  expect(llms).toContain('/llms-full.txt');

  const full = await rawHtml(request, '/llms-full.txt');
  expect(full).toContain('## Answers');
  expect(full).toContain('What is mcpfold?');
});

test('robots.txt allows the major AI crawlers and links the sitemap', async ({ request }) => {
  const robots = await rawHtml(request, '/robots.txt');
  for (const bot of ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended']) {
    expect(robots, `robots.txt names ${bot}`).toContain(`User-agent: ${bot}`);
  }
  expect(robots).toContain('Sitemap: https://mcpfold.com/sitemap.xml');
});

test('homepage + core pages carry FAQPage JSON-LD with self-contained answers (no-JS)', async ({
  request,
}) => {
  for (const path of ['/', '/install', '/pricing', '/directory']) {
    const html = await rawHtml(request, path);
    const faq = jsonLdBlocks(html).find((b) => b['@type'] === 'FAQPage');
    expect(faq, `FAQPage JSON-LD on ${path}`).toBeTruthy();
    const entities = faq!.mainEntity as Array<Record<string, unknown>>;
    expect(entities.length).toBeGreaterThan(0);
    expect(entities[0]!['@type']).toBe('Question');
    const answer = (entities[0]!.acceptedAnswer as Record<string, unknown>).text as string;
    expect(answer.length, 'answer is a real, self-contained sentence').toBeGreaterThan(40);
    // The visible FAQ section exists in the no-JS HTML too (not just the JSON-LD).
    expect(html).toContain('Frequently asked questions');
  }
});
