import { expect, test } from '@playwright/test';

/**
 * Public server directory (S13.5): browse + search, open an indexable entry page with SEO tags,
 * and an add-to-config deep link (CLI snippet + editor prefill) that keeps the token a reference.
 */
test('browse, search, and open an entry with SEO + add-to-config', async ({ page }) => {
  await page.goto('/directory');
  await expect(
    page.getByRole('heading', { name: 'Best MCP servers — the directory' }),
  ).toBeVisible();

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

test('category pages: browse a collection, open a server, and cross-link back', async ({
  page,
}) => {
  await page.goto('/directory');
  // The directory index links out to per-category collection pages.
  await page.getByTestId('category-database').click();
  await expect(page).toHaveURL(/\/directory\/category\/database$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Database');
  await expect(page).toHaveTitle(/Database MCP servers/);

  // The collection lists its servers; Postgres is in the database category.
  await expect(page.getByTestId('category-entries').getByTestId('entry-postgres')).toBeVisible();
  // …and filesystem (a files server) is not.
  await expect(page.getByTestId('entry-filesystem')).toHaveCount(0);

  // A server page links its category tags back to the collection page.
  await page.getByTestId('entry-postgres').click();
  await expect(page).toHaveURL(/\/directory\/postgres$/);
  await page.getByTestId('tag-database').click();
  await expect(page).toHaveURL(/\/directory\/category\/database$/);
});

test('an under-populated category has no page (thin-page guard)', async ({ page }) => {
  await page.goto('/directory');
  // "finance" has a single server (Stripe) — below MIN_CATEGORY_ENTRIES, so it is not offered
  // as a browsable category…
  await expect(page.getByTestId('category-database')).toBeVisible();
  await expect(page.getByTestId('category-finance')).toHaveCount(0);
  // …and hitting its URL directly renders the not-found stub, not a thin collection page.
  await page.goto('/directory/category/finance');
  await expect(page.getByRole('heading', { name: 'Category not found' })).toBeVisible();
});
