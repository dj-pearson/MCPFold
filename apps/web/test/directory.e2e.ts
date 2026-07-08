import { expect, type Page, test } from '@playwright/test';

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill('dev@mcpfold.com');
  await page.getByLabel('Password').fill('password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('http://localhost:5173/');
}

test('search the directory and add an entry that prefills the editor', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Directory' }).click();
  await expect(page).toHaveURL(/\/directory$/);
  // No-endorsement copy is present.
  await expect(page.getByText('not affiliated with or endorsed')).toBeVisible();

  // Search narrows the list.
  await page.getByLabel('Search').fill('github');
  await expect(page.getByTestId('dir-github')).toBeVisible();
  await expect(page.getByTestId('dir-postgres')).toBeHidden();

  // Add to config → the editor opens prefilled with a valid, ref-only entry.
  await page.getByTestId('add-github').click();
  await expect(page).toHaveURL(/\/editor$/);
  await expect(page.getByLabel('Name')).toHaveValue('github');
  await expect(page.getByLabel('Command')).toHaveValue('npx');
  await expect(page.getByLabel('Auth token (reference only)')).toHaveValue('${env:GITHUB_PAT}');
  await expect(page.getByTestId('add-server')).toBeEnabled();

  // The prefilled entry is valid and can be added.
  await page.getByTestId('add-server').click();
  await expect(page.getByTestId('server-github')).toBeVisible();
});
