import { expect, test } from '@playwright/test';

/**
 * Global navigation + site IA (S13.9). Header (desktop + accessible mobile menu), active-route
 * indication, a complete footer link map that resolves against the route table, a skip-to-content
 * link, and the theme toggle — all driven by site-structure.ts.
 */

test('header shows live pages and marks the active route', async ({ page }) => {
  await page.goto('/directory');
  // Live top-level items are present (Features S13.10 + Guides S15.5 now shipped).
  for (const item of ['features', 'docs', 'directory', 'guides', 'pricing', 'blog']) {
    await expect(page.getByTestId(`nav-${item}`)).toBeVisible();
  }
  // Active route is indicated.
  await expect(page.getByTestId('nav-directory')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('nav-pricing')).not.toHaveAttribute('aria-current', 'page');
  // Primary install CTA.
  await expect(page.getByTestId('cta-install')).toHaveAttribute('href', '/install');
});

test('clicking a nav item navigates and moves the active state', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-pricing').click();
  await expect(page).toHaveURL(/\/pricing$/);
  await expect(page.getByTestId('nav-pricing')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('nav-directory')).not.toHaveAttribute('aria-current', 'page');
});

test('mobile menu: opens, navigates, and closes on link click + Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  // Collapsed by default; the hamburger is the control.
  await expect(page.getByTestId('mobile-menu')).toHaveCount(0);
  const button = page.getByTestId('menu-button');
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute('aria-expanded', 'false');

  // Open → menu appears and navigates.
  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  const menu = page.getByTestId('mobile-menu');
  await expect(menu).toBeVisible();
  await menu.getByTestId('nav-directory').click();
  await expect(page).toHaveURL(/\/directory$/);
  await expect(page.getByTestId('mobile-menu')).toHaveCount(0); // closed on navigate

  // Reopen, then Escape closes it.
  await button.click();
  await expect(page.getByTestId('mobile-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('mobile-menu')).toHaveCount(0);
});

test('footer link map resolves against the route table (no 404)', async ({ page }) => {
  await page.goto('/');
  const links = page.locator('footer [data-testid^="footer-link-"]');
  const hrefs = await links.evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''));
  expect(hrefs.length).toBeGreaterThan(6);

  // Every live internal footer href must map to a mounted route in the E13 surface.
  const validInternal =
    /^\/($|install$|directory$|compare$|use-cases$|pricing$|features$|changelog$|security$|about$|privacy$|terms$|analytics$|brand$|glossary$|roadmap$|guides$|community$|blog$|docs(\/|$))/;
  for (const href of hrefs) {
    if (href.startsWith('http')) continue; // external
    expect(href, `footer link ${href} must resolve`).toMatch(validInternal);
  }

  // A real marketing footer link resolves (not a 404 shell).
  await page.getByTestId('footer-link-/changelog').click();
  await expect(page).toHaveURL(/\/changelog$/);
  await expect(page).toHaveTitle(/Changelog/);
});

test('skip-to-content link targets main and the theme toggle works', async ({ page }) => {
  await page.goto('/');
  const skip = page.getByTestId('skip-link');
  await expect(skip).toHaveAttribute('href', '#main');
  // Tabbing from the top surfaces the skip link first (it becomes focusable/visible on focus).
  await page.keyboard.press('Tab');
  await expect(skip).toBeFocused();
  await expect(page.locator('main#main')).toHaveCount(1);

  // Theme toggle flips the applied theme.
  await page.getByTestId('theme-toggle').click();
  const t1 = await page.locator('html').getAttribute('data-theme');
  expect(t1 === 'light' || t1 === 'dark').toBe(true);
  await page.getByTestId('theme-toggle').click();
  expect(await page.locator('html').getAttribute('data-theme')).not.toBe(t1);
});
