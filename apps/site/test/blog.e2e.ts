import { expect, test } from '@playwright/test';

/**
 * Blog + changelog (S13.7): the index lists markdown posts with an RSS link, a post renders with
 * OG tags, and the changelog reflects the CHANGELOG source.
 */
test('blog index lists posts and links RSS', async ({ page }) => {
  await page.goto('/blog');
  await expect(page.getByRole('heading', { level: 1, name: 'Blog' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'RSS' })).toHaveAttribute('href', '/feed.xml');
  await expect(page.getByTestId('post-introducing-mcpfold')).toBeVisible();
  await expect(page.getByTestId('post-the-context-window-tax')).toBeVisible();
});

test('a post renders the markdown with its own SEO tags', async ({ page }) => {
  await page.goto('/blog');
  await page.getByTestId('post-the-context-window-tax').getByRole('link').first().click();
  await expect(page).toHaveURL(/\/blog\/the-context-window-tax$/);
  await expect(page).toHaveTitle(/context-window tax/);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    'content',
    /context-window tax/,
  );
  // The authored markdown rendered to HTML.
  await expect(page.getByTestId('post-body')).toContainText('7,476');
});

test('the changelog reflects the CHANGELOG source', async ({ page }) => {
  await page.goto('/changelog');
  await expect(page.getByTestId('changelog-body')).toContainText('Changelog');
  await expect(page.getByTestId('changelog-body')).toContainText('v0.1.0');
});
