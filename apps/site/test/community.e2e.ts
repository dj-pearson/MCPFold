import { expect, test } from '@playwright/test';
import { allSitemaps } from './_sitemap';

/**
 * S13.15 — community & support page. Proves /community renders the engagement channels, the
 * `mcpfold diagnose` bug-report guidance, and resolving links (GitHub Discussions/issues, the
 * adapter-request + bug-report templates, CONTRIBUTING, the adapter/CLI docs) in the initial HTML
 * (no JS), that it's footer-linked and in the sitemap, and carries a breadcrumb. Runs against `vite
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

test('/community: channels + diagnose guidance + resolving links (no-JS)', async ({ request }) => {
  const html = await rawHtml(request, '/community');
  expect(html).toContain('Community &amp; support');
  expect(html).toContain('<title>Community &amp; support — mcpfold</title>');
  expect(html).not.toMatch(/<div id="root"><\/div>/);

  // The bug-report guidance names the sanitized diagnostics command.
  expect(html).toContain('mcpfold diagnose');
  expect(html.toLowerCase()).toContain('redacted');

  // Engagement links are present (verified to be the real GitHub paths + docs).
  const links = [
    'https://github.com/dj-pearson/MCPFold/discussions',
    'https://github.com/dj-pearson/MCPFold/issues',
    'template=adapter_request.yml',
    'template=bug_report.yml',
    '/blob/main/CONTRIBUTING.md',
    '/docs/adapters.html',
    '/docs/cli-contract.html',
  ];
  for (const l of links) expect(html, `link ${l}`).toContain(l);

  // No-endorsement note.
  expect(html).toContain('not affiliated with or endorsed by the MCP project');

  expect(
    jsonLdBlocks(html).find((b) => b['@type'] === 'BreadcrumbList'),
    'breadcrumb',
  ).toBeTruthy();
});

test('/community is footer-linked and in the sitemap', async ({ request }) => {
  const home = await rawHtml(request, '/');
  expect(home).toContain('href="/community"');

  const sitemap = await allSitemaps(request);
  expect(sitemap).toContain('https://mcpfold.com/community');
});

test('the adapter-request and bug-report issue templates the page links to exist in the repo', async () => {
  // Guards against the community page pointing at a template that was renamed or removed.
  const { existsSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  for (const tpl of ['adapter_request.yml', 'bug_report.yml']) {
    const path = join(repoRoot, '.github', 'ISSUE_TEMPLATE', tpl);
    expect(existsSync(path), `${tpl} exists`).toBe(true);
  }
});
