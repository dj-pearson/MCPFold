import { expect, test } from '@playwright/test';

/**
 * Public server directory (S13.5): browse + search, open an indexable entry page with SEO tags,
 * and an add-to-config deep link (CLI snippet + editor prefill) that keeps the token a reference.
 */
test('browse, search, and open an entry with SEO + add-to-config', async ({ page }) => {
  await page.goto('/directory');
  await expect(page.getByRole('heading', { name: 'MCP server directory' })).toBeVisible();

  // Search narrows the list.
  await page.getByTestId('directory-search').fill('github');
  await expect(page.getByTestId('entry-github')).toBeVisible();
  await expect(page.getByTestId('entry-filesystem')).toHaveCount(0);

  // Open the entry's own page.
  await page.getByTestId('entry-github').click();
  await expect(page).toHaveURL(/\/directory\/github$/);
  await expect(page).toHaveTitle(/GitHub/);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /GitHub/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /GitHub API/);

  // Add-to-config: a valid CLI snippet, an editor prefill link, and the token as a reference.
  await expect(page.getByTestId('add-snippet')).toContainText(
    'mcpfold add @modelcontextprotocol/server-github',
  );
  await expect(page.getByText('${env:GITHUB_PAT}')).toBeVisible();
  await expect(page.getByTestId('editor-link')).toHaveAttribute(
    'href',
    /app\.mcpfold\.com\/directory\?add=github/,
  );
});
