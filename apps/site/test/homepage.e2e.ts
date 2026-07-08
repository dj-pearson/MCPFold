import { expect, test } from '@playwright/test';

test('homepage renders the value prop and benchmark headline', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('context-window tax');
  await expect(page.getByTestId('benchmark-headline')).toContainText('80%');
  await expect(page.getByRole('main').getByRole('link', { name: 'Install' })).toBeVisible();
});

test('theme toggle flips the color theme', async ({ page }) => {
  await page.goto('/');
  const html = page.locator('html');
  await page.getByTestId('theme-toggle').click();
  const first = await html.getAttribute('data-theme');
  expect(first === 'light' || first === 'dark').toBe(true);
  await page.getByTestId('theme-toggle').click();
  const second = await html.getAttribute('data-theme');
  expect(second).not.toBe(first); // toggled back
});

test('SEO: title, description, and Open Graph tags are present', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/mcpfold/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    /context-window/,
  );
  await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    'content',
    'summary_large_image',
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://mcpfold.com/',
  );
});
