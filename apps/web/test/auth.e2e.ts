import { expect, test } from '@playwright/test';

// Auth flow + route gating (S7.1). Uses the VITE_E2E mock auth: any email + password "password".

test('an unauthenticated visitor is redirected to /login', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'mcpfold' })).toBeVisible();
});

test('sign in reaches the dashboard, then sign out returns to login', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('dev@mcpfold.com');
  await page.getByLabel('Password').fill('password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL('http://localhost:5173/');
  await expect(page.getByText('Signed in as')).toBeVisible();
  await expect(page.getByText('dev@mcpfold.com')).toBeVisible();
  // Reuses @mcpfold/core — the six client ids render as chips.
  await expect(page.getByText('cursor', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('wrong credentials show an error and stay on login', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('dev@mcpfold.com');
  await page.getByLabel('Password').fill('nope');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText('Invalid login credentials');
  await expect(page).toHaveURL(/\/login$/);
});
