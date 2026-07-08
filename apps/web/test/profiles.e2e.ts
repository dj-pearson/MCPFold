import { expect, type Page, test } from '@playwright/test';

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill('dev@mcpfold.com');
  await page.getByLabel('Password').fill('password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('http://localhost:5173/');
}

test('create a profile and preview the servers it resolves to', async ({ page }) => {
  await login(page);

  // Seed a tagged server via the editor, then save so the profile manager can read it.
  await page.getByRole('link', { name: 'Editor' }).click();
  await page.getByLabel('Name').fill('github');
  await page.getByLabel('Command').fill('npx');
  await page.getByLabel('Tags (comma-separated)').fill('work');
  await page.getByTestId('add-server').click();
  await page.getByTestId('save').click();
  await expect(page.locator('.editor-head')).toContainText('version 1');

  // Create a profile including that tag — the live preview should resolve to the server.
  await page.getByRole('link', { name: 'Profiles' }).click();
  await expect(page).toHaveURL(/\/profiles$/);
  await page.getByLabel('Name').fill('dev');
  await page.getByLabel('Include tags (comma-separated)').fill('work');
  await expect(page.getByTestId('preview-github')).toBeVisible();

  await page.getByTestId('add-profile').click();
  await expect(page.getByTestId('profile-dev')).toBeVisible();
});

test('project scope requires a path (shared-schema validation)', async ({ page }) => {
  await login(page);
  await page.goto('/profiles');
  await page.getByLabel('Name').fill('proj');
  await page.getByLabel('Scope').selectOption('project');
  await expect(page.getByRole('alert')).toContainText('path');
  await expect(page.getByTestId('add-profile')).toBeDisabled();
  await page.getByLabel('Path').fill('/repo');
  await expect(page.getByTestId('add-profile')).toBeEnabled();
});
