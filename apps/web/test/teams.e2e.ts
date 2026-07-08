import { expect, type Page, test } from '@playwright/test';

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill('dev@mcpfold.com');
  await page.getByLabel('Password').fill('password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('http://localhost:5173/');
}

test('create a team, manage a member, and see the audit trail (S7.6)', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Teams' }).click();
  await expect(page).toHaveURL(/\/teams$/);

  // Teams are marked a paid feature (billing gate stub).
  await expect(page.getByTestId('billing-gate')).toBeVisible();

  // Create a team → it opens with the owner as the sole member and an audit entry.
  await page.getByLabel('New team name').fill('Acme');
  await page.getByTestId('create-team').click();
  await expect(page.getByTestId('member-dev@mcpfold.com')).toBeVisible();
  // The audit trail shows the change with a per-version diff.
  await expect(page.getByTestId('audit-1')).toContainText('github');

  // Invite a member with a role…
  await page.getByLabel('Invite by email').fill('bob@example.com');
  await page.getByTestId('invite').click();
  await expect(page.getByTestId('member-bob@example.com')).toBeVisible();

  // …and removing them takes effect immediately.
  await page.getByTestId('remove-bob@example.com').click();
  await expect(page.getByTestId('member-bob@example.com')).toHaveCount(0);
  await expect(page.getByTestId('member-dev@mcpfold.com')).toBeVisible();
});
