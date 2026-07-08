import { expect, type Page, test } from '@playwright/test';

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill('dev@mcpfold.com');
  await page.getByLabel('Password').fill('password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('http://localhost:5173/');
}

test('sync dashboard lists machines and highlights an out-of-date one', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Sync' }).click();
  await expect(page).toHaveURL(/\/machines$/);

  // Both machines are listed…
  await expect(page.getByTestId('machine-laptop')).toBeVisible();
  await expect(page.getByTestId('machine-desktop')).toBeVisible();

  // …and the one behind the latest version is flagged.
  await expect(page.getByTestId('behind-desktop')).toBeVisible();
  await expect(page.getByTestId('behind-laptop')).toHaveCount(0);

  // Version history shows recent versions with an author.
  await expect(page.getByTestId('history-3')).toContainText('dev@mcpfold.com');
  await expect(page.getByTestId('history-1')).toBeVisible();
});

test('revoking a machine removes it from the dashboard (S9.5)', async ({ page }) => {
  await login(page);
  await page.goto('/machines');
  await expect(page.getByTestId('machine-desktop')).toBeVisible();
  await page.getByTestId('revoke-desktop').click();
  await expect(page.getByTestId('machine-desktop')).toHaveCount(0);
  await expect(page.getByTestId('machine-laptop')).toBeVisible();
});
