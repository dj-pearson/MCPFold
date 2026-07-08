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
