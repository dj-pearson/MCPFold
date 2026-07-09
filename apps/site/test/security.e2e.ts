import { expect, test } from '@playwright/test';

/**
 * Security & trust page (S13.13). The page renders the secret-handling summary and the private
 * disclosure path, is reachable from the footer and the pricing FAQ, and its claims mirror
 * SECURITY.md / docs/security.md (cross-checked in review — the copy states the honest caveats:
 * the opt-in `inline` strategy and config-is-executable-code).
 */

test('the security page summarizes secret handling and the disclosure path', async ({ page }) => {
  await page.goto('/security');
  await expect(page.getByRole('heading', { level: 1, name: /Security & trust/ })).toBeVisible();
  await expect(page).toHaveTitle(/Security & trust/);

  // Refs-only secret handling — the core claim, with its honest caveat.
  const secrets = page.getByTestId('security-secrets');
  await expect(secrets).toContainText('references');
  await expect(secrets).toContainText('${env:GITHUB_PAT}');
  await expect(secrets).toContainText('gitignored'); // the inline-strategy caveat, not overstated

  // The other pillars are present.
  await expect(page.getByTestId('security-cloud')).toContainText('never values');
  await expect(page.getByTestId('security-redaction')).toContainText('MCPFOLD_TELEMETRY=1');
  await expect(page.getByTestId('security-verified')).toContainText('leak harness');

  // Responsible disclosure links SECURITY.md + the private advisory path.
  const disc = page.getByTestId('security-disclosure');
  await expect(disc.getByTestId('security-md-link')).toHaveAttribute(
    'href',
    /github\.com\/dj-pearson\/MCPFold\/blob\/main\/SECURITY\.md/,
  );
  await expect(disc.getByTestId('advisory-link')).toHaveAttribute(
    'href',
    /security\/advisories\/new/,
  );
});

test('the security page is reachable from the footer', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('footer-link-/security').click();
  await expect(page).toHaveURL(/\/security$/);
  await expect(page.getByRole('heading', { level: 1, name: /Security & trust/ })).toBeVisible();
});

test('the security page is linked from the pricing FAQ', async ({ page }) => {
  await page.goto('/pricing');
  const more = page.getByTestId('faq-more-link');
  await expect(more).toHaveAttribute('href', '/security');
  await more.click();
  await expect(page).toHaveURL(/\/security$/);
});
