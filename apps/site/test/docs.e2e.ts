import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';

/**
 * Unified docs (S13.4): the S8.1 docs build now renders inside the marketing shell with a shared
 * header/theme and client-side search. Tested against the built dist-docs via file:// (the docs are
 * static, served alongside the SPA at /docs). Skipped until `pnpm docs:build` has run.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const DOCS = join(ROOT, 'dist-docs');
const docUrl = (f: string) => pathToFileURL(join(DOCS, f)).href;
const built = existsSync(join(DOCS, 'index.html'));

test.describe('unified docs', () => {
  test.skip(!built, 'run `pnpm docs:build` first');

  test('render inside the shared marketing shell', async ({ page }) => {
    await page.goto(docUrl('index.html'));
    await expect(page.getByRole('link', { name: 'mcpfold' })).toBeVisible();
    await expect(page.locator('header.site').getByRole('link', { name: 'Install' })).toBeVisible();
    await expect(page.getByTestId('theme-toggle')).toBeVisible();
  });

  test('client-side search finds a known page', async ({ page }) => {
    await page.goto(docUrl('index.html'));
    await page.getByTestId('docs-search').fill('secrets');
    const result = page.getByTestId('search-result').first();
    await expect(result).toBeVisible();
    await expect(result).toContainText('Secrets');
    await expect(result).toHaveAttribute('href', /secrets\.html/);
  });

  test('deep-link heading anchors resolve', async ({ page }) => {
    await page.goto(docUrl('config-format.html'));
    // The link index.html → config-format.html#json-schema must land on a real element.
    await expect(page.locator('#json-schema')).toHaveCount(1);
  });

  test('the hosted JSON schema is served and valid', async () => {
    const schemaPath = join(DOCS, 'schema', 'v1.json');
    expect(existsSync(schemaPath)).toBe(true);
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    expect(schema).toBeTruthy();
  });
});
