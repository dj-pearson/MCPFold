import { expect, test } from '@playwright/test';
import { allSitemaps } from './_sitemap';

/**
 * S13.16 — public roadmap page. Proves /roadmap renders the SINGLE source (docs/roadmap.md) — its
 * status-group headings and items appear in the prerendered no-JS HTML, so an edit to the source
 * reflows the page (no forked copy) — with the doc-relative links rewritten to the published docs,
 * plus footer + sitemap membership and a breadcrumb. Runs against `vite preview` of the built dist/.
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

/** Read the roadmap source markdown from the repo (the page's single source of truth). */
async function roadmapSource(): Promise<string> {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  return readFileSync(join(repoRoot, 'docs', 'roadmap.md'), 'utf8');
}

test('/roadmap renders the docs/roadmap.md source with its status-group headings (no-JS)', async ({
  request,
}) => {
  const html = await rawHtml(request, '/roadmap');
  expect(html).toContain('data-testid="roadmap-body"');
  expect(html).toContain('<title>Roadmap — mcpfold</title>');
  expect(html).not.toMatch(/<div id="root"><\/div>/);

  // Every `## ` heading in the source appears in the rendered page — proving it renders the actual
  // single source (a forked copy would diverge; an edit to the source would be reflected here).
  const source = await roadmapSource();
  const headings = [...source.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1]!.trim());
  expect(headings.length, 'source has status-group headings').toBeGreaterThanOrEqual(2);
  for (const h of headings) {
    expect(html, `roadmap renders the "${h}" group from source`).toContain(h);
  }
});

test('/roadmap rewrites doc-relative links to the published docs (no-JS)', async ({ request }) => {
  const html = await rawHtml(request, '/roadmap');
  // The source links to ./telemetry.md and ./coverage.md; these must point at the docs site, not
  // dead `.md` paths.
  expect(html).not.toMatch(/href="\.\/[^"]+\.md/);
  expect(html).toMatch(/href="\/docs\/[^"]+\.html/);

  expect(
    jsonLdBlocks(html).find((b) => b['@type'] === 'BreadcrumbList'),
    'breadcrumb',
  ).toBeTruthy();
});

test('/roadmap is footer-linked and in the sitemap', async ({ request }) => {
  const home = await rawHtml(request, '/');
  expect(home).toContain('href="/roadmap"');

  const sitemap = await allSitemaps(request);
  expect(sitemap).toContain('https://mcpfold.com/roadmap');
});
