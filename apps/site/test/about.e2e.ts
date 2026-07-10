import { expect, test } from '@playwright/test';
import { allSitemaps } from './_sitemap';

/**
 * S13.12 — about / open-source project page. Proves /about serves the mission, the OSS model +
 * license boundary, working GitHub/contributing/governance/roadmap links, the build-time latest
 * release, and Organization + breadcrumb structured data in the initial HTML (no JS); and that the
 * live GitHub signals (stars/contributors) degrade gracefully when the API is unavailable. Runs
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

test('/about: mission + license boundary + release + links + schema (no-JS)', async ({
  request,
}) => {
  const html = await rawHtml(request, '/about');
  expect(html).toContain('About mcpfold');
  expect(html).toContain('<title>About mcpfold — the open-source MCP config manager</title>');
  expect(html).not.toMatch(/<div id="root"><\/div>/);

  // Mission + the OSS license boundary are server-rendered.
  expect(html).toContain('The mission');
  expect(html).toContain('MIT-licensed');
  expect(html.toLowerCase()).toContain('self-host');
  // No-implied-endorsement note.
  expect(html).toContain('not affiliated with or endorsed by the MCP project');

  // Latest release comes from the build, so it's in the no-JS HTML.
  expect(html).toMatch(/data-testid="latest-release">v\d+\.\d+\.\d+/);

  // Working links: GitHub, CONTRIBUTING, governance, roadmap, adapters.
  expect(html).toContain('https://github.com/dj-pearson/MCPFold');
  expect(html).toContain('/blob/main/CONTRIBUTING.md');
  expect(html).toContain('/docs/governance.html');
  expect(html).toContain('/docs/roadmap.html');
  expect(html).toContain('/docs/adapters.html');

  const blocks = jsonLdBlocks(html);
  expect(
    blocks.find((b) => b['@type'] === 'Organization'),
    'Organization JSON-LD',
  ).toBeTruthy();
  const crumb = blocks.find((b) => b['@type'] === 'BreadcrumbList');
  expect(crumb, 'breadcrumb').toBeTruthy();
});

test('live GitHub signals degrade gracefully when the API is unavailable', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(msg.text());
  });
  page.on('pageerror', (err) => problems.push(String(err)));

  // Block the GitHub API so stars/contributors can never resolve.
  await page.route('https://api.github.com/**', (route) => route.abort());

  await page.goto('/about');
  // Hydration attached (shared header control).
  await expect(page.getByTestId('theme-toggle')).toBeVisible();

  // The page and its GitHub link still render; the optional signals are simply absent.
  await expect(page.getByTestId('about-github')).toBeVisible();
  await expect(page.getByTestId('latest-release')).toBeVisible(); // build-time, always there
  await expect(page.getByTestId('about-stars')).toHaveCount(0);
  await expect(page.getByTestId('about-contributors')).toHaveCount(0);

  // No uncaught APP errors — the failed network requests themselves log expected resource-load
  // noise (ERR_FAILED / the blocked github.com host), which is not an application error.
  const appProblems = problems.filter(
    (t) => !/Failed to load resource|ERR_FAILED|api\.github\.com/i.test(t),
  );
  expect(appProblems, `app errors:\n${appProblems.join('\n')}`).toEqual([]);
});

test('/about is in the sitemap and linked from the footer (prerendered)', async ({ request }) => {
  const sitemap = await allSitemaps(request);
  expect(sitemap).toContain('https://mcpfold.com/about');

  // The footer is server-rendered on every page, so the /about link is in the no-JS homepage HTML.
  const home = await rawHtml(request, '/');
  expect(home).toContain('href="/about"');
});
