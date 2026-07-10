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

  // Create a team → it opens with the owner as the sole member and an audit entry.
  await page.getByLabel('New team name').fill('Acme');
  await page.getByTestId('create-team').click();
  await expect(page.getByTestId('member-dev@mcpfold.com')).toBeVisible();
  await expect(page.getByTestId('audit-1')).toContainText('github');

  // S20.2: a new team is on the FREE tier — inviting members is gated behind an upgrade.
  await expect(page.getByTestId('billing-gate')).toHaveAttribute('data-tier', 'cloud-free');
  await expect(page.getByTestId('upgrade-cta')).toBeVisible();
  await expect(page.getByTestId('invite')).toBeDisabled();

  // Upgrade (mock Checkout completes the subscription) → tier flips to Team, invite unlocks.
  await page.getByTestId('upgrade').click();
  await expect(page.getByTestId('billing-gate')).toHaveAttribute('data-tier', 'team');
  await expect(page.getByTestId('upgrade-cta')).toHaveCount(0);
  await expect(page.getByTestId('manage-billing')).toBeVisible();

  // Now inviting a member works…
  await page.getByLabel('Invite by email').fill('bob@example.com');
  await page.getByTestId('invite').click();
  await expect(page.getByTestId('member-bob@example.com')).toBeVisible();

  // …and removing them takes effect immediately.
  await page.getByTestId('remove-bob@example.com').click();
  await expect(page.getByTestId('member-bob@example.com')).toHaveCount(0);
  await expect(page.getByTestId('member-dev@mcpfold.com')).toBeVisible();

  // Inviting an email with no account (S20.3) → a pending invite with a one-time link, not a member.
  await page.getByLabel('Invite by email').fill('newbie@example.com');
  await page.getByTestId('invite').click();
  await expect(page.getByTestId('member-newbie@example.com')).toHaveCount(0);
  await expect(page.getByTestId('invite-link')).toBeVisible();
  await expect(page.getByTestId('pending-newbie@example.com')).toBeVisible();

  // Revoking the pending invite removes it from the list.
  await page.getByTestId('revoke-invite-newbie@example.com').click();
  await expect(page.getByTestId('pending-newbie@example.com')).toHaveCount(0);
});
