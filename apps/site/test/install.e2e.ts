import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

/**
 * Install page (S13.3): the visitor's OS is auto-selected (overridable via ?os=), the copy button
 * gives feedback, and the version is rendered from the CLI package (not hardcoded).
 */
const cliVersion = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../../../packages/cli/package.json'),
    'utf8',
  ),
).version;

test('auto-selects the visitor OS and shows its channels', async ({ page }) => {
  await page.goto('/install?os=mac');
  await expect(page.getByTestId('os-mac')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('channel-brew')).toBeVisible();

  await page.goto('/install?os=windows');
  await expect(page.getByTestId('os-windows')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('channel-scoop')).toBeVisible();
  await expect(page.getByTestId('channel-brew')).toHaveCount(0); // brew hidden on Windows
});

test('the copy button gives feedback', async ({ page }) => {
  await page.goto('/install?os=mac');
  const copy = page.getByTestId('copy-button').first();
  await expect(copy).toHaveText('Copy');
  await copy.click();
  await expect(copy).toHaveText('Copied!');
});

test('the latest version is rendered from the CLI package (not hardcoded)', async ({ page }) => {
  await page.goto('/install');
  await expect(page.getByTestId('version-badge')).toContainText(`v${cliVersion}`);
});
