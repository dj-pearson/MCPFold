import { expect, test } from '@playwright/test';

/**
 * S13.18 — reusable email capture. Interactive (dev-server) test: the form validates, submits to a
 * MOCKED sink and shows success, degrades to an error state when the sink fails, and the honeypot
 * blocks a bot submission (no network call). Runs under the default Playwright config (dev server).
 */

async function gotoHome(page: import('@playwright/test').Page) {
  await page.goto('/');
  await expect(page.getByTestId('subscribe')).toBeVisible();
}

test('a valid email submits to the sink and shows success', async ({ page }) => {
  let posted = 0;
  await page.route('**/subscribe', async (route) => {
    posted++;
    await route.fulfill({ status: 202, contentType: 'application/json', body: '{"ok":true}' });
  });

  await gotoHome(page);
  await page.getByPlaceholder('you@example.com').fill('user@example.com');
  await page.getByTestId('subscribe-submit').click();

  await expect(page.getByTestId('subscribe-success')).toBeVisible();
  expect(posted, 'one POST to the sink').toBe(1);
});

test('an invalid email shows an error and never hits the sink', async ({ page }) => {
  let posted = 0;
  await page.route('**/subscribe', async (route) => {
    posted++;
    await route.fulfill({ status: 202, body: '{"ok":true}' });
  });

  await gotoHome(page);
  await page.getByPlaceholder('you@example.com').fill('not-an-email');
  await page.getByTestId('subscribe-submit').click();

  await expect(page.getByTestId('subscribe-error')).toBeVisible();
  expect(posted, 'no POST for an invalid email').toBe(0);
});

test('the form degrades gracefully when the sink is unavailable', async ({ page }) => {
  await page.route('**/subscribe', (route) => route.fulfill({ status: 500, body: 'nope' }));

  await gotoHome(page);
  await page.getByPlaceholder('you@example.com').fill('user@example.com');
  await page.getByTestId('subscribe-submit').click();

  // No throw, no success — a retry-able error is shown instead.
  await expect(page.getByTestId('subscribe-error')).toBeVisible();
  await expect(page.getByTestId('subscribe-success')).toHaveCount(0);
});

test('the honeypot blocks a bot submission (no network call)', async ({ page }) => {
  let posted = 0;
  await page.route('**/subscribe', async (route) => {
    posted++;
    await route.fulfill({ status: 202, body: '{"ok":true}' });
  });

  await gotoHome(page);
  // A bot fills the off-screen honeypot field; a human never would.
  await page.locator('#subscribe-website').fill('http://spam.example');
  await page.getByPlaceholder('you@example.com').fill('bot@example.com');
  await page.getByTestId('subscribe-submit').click();

  // It looks successful to the bot, but nothing was sent.
  await expect(page.getByTestId('subscribe-success')).toBeVisible();
  expect(posted, 'honeypot hit must not POST').toBe(0);
});
