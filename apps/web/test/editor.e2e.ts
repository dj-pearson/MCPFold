import { expect, type Page, test } from '@playwright/test';

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill('dev@mcpfold.com');
  await page.getByLabel('Password').fill('password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('http://localhost:5173/');
}

test('add a server, block a raw token, and save a version', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Editor' }).click();
  await expect(page).toHaveURL(/\/editor$/);

  // Add a stdio server — validated by the shared schema.
  await page.getByLabel('Name').fill('github');
  await page.getByLabel('Command').fill('npx');
  await page.getByTestId('add-server').click();
  await expect(page.getByTestId('server-github')).toBeVisible();

  // A raw token is blocked with guidance and the Add button is disabled.
  await page.getByLabel('Name').fill('gitlab');
  await page.getByLabel('Command').fill('npx');
  await page.getByLabel('Auth token (reference only)').fill('ghp_rawtokenvalue123456');
  await expect(page.getByRole('alert')).toContainText('reference');
  await expect(page.getByTestId('add-server')).toBeDisabled();
  // A proper ${provider:path} reference clears the error.
  await page.getByLabel('Auth token (reference only)').fill('${env:GL_TOKEN}');
  await expect(page.getByTestId('add-server')).toBeEnabled();

  // Save creates a new version and shows the history.
  await page.getByTestId('save').click();
  await expect(page.locator('.editor-head')).toContainText('version 1');
  await expect(page.locator('.history')).toContainText('version 1');
});

test('http transport requires a url (live schema validation)', async ({ page }) => {
  await login(page);
  await page.goto('/editor');
  await page.getByLabel('Name').fill('remote');
  await page.getByLabel('Transport').selectOption('http');
  // No URL yet → the add button stays disabled (schema: http/sse need a url).
  await expect(page.getByTestId('add-server')).toBeDisabled();
  await page.getByLabel('URL').fill('https://api.example/mcp');
  await expect(page.getByTestId('add-server')).toBeEnabled();
});
