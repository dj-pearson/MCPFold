import { expect, test } from '@playwright/test';

/**
 * Homepage hero + interactive benchmark (S13.2). Verifies the calculator reacts to input, the
 * recorded demo is embedded, and the default numbers match the committed benchmark (7,476 → 1,497,
 * ~80%) so the site can never disagree with docs/benchmark.md.
 */

test('the recorded demo is embedded in the hero', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('demo-image')).toBeVisible();
});

test('the benchmark calculator defaults to the committed numbers', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('tools-out')).toHaveText('45 → 9');
  await expect(page.getByTestId('tokens-out')).toHaveText('7,476 → 1,497');
  await expect(page.getByTestId('reduction-out')).toHaveText('80%');
});

test('the calculator updates savings when inputs change', async ({ page }) => {
  await page.goto('/');
  // Keep more tools per server → smaller reduction.
  await page.getByTestId('keep-slider').fill('12');
  await expect(page.getByTestId('keep-value')).toHaveText('12');
  await expect(page.getByTestId('reduction-out')).not.toHaveText('80%');

  // Deselect a server → fewer tools in play.
  await page.getByTestId('keep-slider').fill('3');
  await page.getByTestId('server-github').uncheck();
  await expect(page.getByTestId('tools-out')).not.toHaveText('45 → 9');
});

// ------------------------------------------------------------------------------------------------
// On-page SEO (S15.3): keyword-led title/H1/meta, crawlable client list, internal-link graph
// ------------------------------------------------------------------------------------------------
test('title, H1, and meta lead with the MCP config keyword cluster', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/MCP config for every MCP client/);
  const h1 = page.getByRole('heading', { level: 1 });
  await expect(h1).toContainText('MCP config'); // primary keyword
  await expect(h1).toContainText('mcpfold'); // brand
  const desc = await page.locator('meta[name="description"]').getAttribute('content');
  expect(desc).toMatch(/Manage MCP servers/);
  expect(desc!.length).toBeLessThanOrEqual(165); // meta-description length budget
  // The first ~100 words name the clients + MCP servers.
  await expect(page.getByTestId('hero-intro')).toContainText('MCP servers');
  for (const client of ['Claude Code', 'Cursor', 'VS Code', 'Windsurf', 'Zed']) {
    await expect(page.getByTestId('hero-intro')).toContainText(client);
  }
});

test('below-fold H2 sections target the keyword clusters', async ({ page }) => {
  await page.goto('/');
  for (const h2 of [
    'Manage every MCP server from one file',
    'Works with every MCP client',
    'Curate tools, cut the context-window tax',
    'Secrets as references, never values',
  ]) {
    await expect(page.getByRole('heading', { level: 2, name: h2 })).toBeVisible();
  }
});

test('the supported clients render as crawlable links', async ({ page }) => {
  await page.goto('/');
  const list = page.getByTestId('client-list');
  for (const client of ['Claude Desktop', 'Cursor', 'VS Code', 'Zed', 'JetBrains']) {
    await expect(list.getByRole('link', { name: client })).toBeVisible();
  }
});

test('the homepage anchors the internal-link graph', async ({ page }) => {
  await page.goto('/');
  const explore = page.getByTestId('explore-links');
  await expect(explore.getByRole('link', { name: 'MCP server directory' })).toHaveAttribute(
    'href',
    '/directory',
  );
  await expect(explore.getByRole('link', { name: 'Documentation' })).toHaveAttribute(
    'href',
    '/docs',
  );
  await expect(explore.getByRole('link', { name: 'Pricing' })).toHaveAttribute('href', '/pricing');
});
