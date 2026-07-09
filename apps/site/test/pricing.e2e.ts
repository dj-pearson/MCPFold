import { expect, test } from '@playwright/test';

/**
 * Pricing page (S13.6): renders the tiers from the S14.3 single source, contrasts free OSS with the
 * paid team cloud, has an FAQ, and a signup CTA that routes into the app.
 */
test('renders the tiers from source and funnels signup into the app', async ({ page }) => {
  await page.goto('/pricing');
  await expect(page.getByRole('heading', { level: 1, name: 'Pricing' })).toBeVisible();

  // All four tiers from tiers.ts render, with their prices.
  await expect(page.getByTestId('tier-oss')).toContainText('Free forever');
  await expect(page.getByTestId('price-team')).toHaveText('$6 / user / mo');
  await expect(page.getByTestId('tier-enterprise')).toBeVisible();

  // Free OSS vs paid team is contrasted (self-host, audit trail).
  await expect(page.getByTestId('tier-oss')).toContainText('Self-host');
  await expect(page.getByTestId('tier-team')).toContainText('audit trail');

  // The Team CTA routes into the app auth.
  await expect(page.getByTestId('cta-team')).toHaveAttribute('href', 'https://app.mcpfold.com');

  // FAQ (S15.2 shared, extraction-friendly) covers self-hosting + licensing.
  await expect(page.getByText('Can I self-host the mcpfold cloud?')).toBeVisible();
  await expect(page.getByText('What is the mcpfold license?')).toBeVisible();
});
