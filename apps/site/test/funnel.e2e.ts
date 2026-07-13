import { expect, test, type Page } from '@playwright/test';

/**
 * S21.5 — web-funnel instrumentation. Runs against the Vite dev server with a MOCK analytics sink
 * (window.plausible captured into window.__events), so we assert the funnel events fire with the
 * expected payload without any real network sink. Covers install-command copy, calculator engagement
 * (config pasted + install clicked), channel attribution via ?ref, and outbound clicks to npm/GitHub.
 */

type CapturedEvent = { event: string; props: Record<string, unknown> };

/** Install a mock `window.plausible` before any page script runs, capturing events for assertions. */
async function mockAnalytics(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { __events: CapturedEvent[] }).__events = [];
    (window as unknown as { plausible: (e: string, o?: { props?: Record<string, unknown> }) => void }).plausible =
      (event, options) => {
        (window as unknown as { __events: CapturedEvent[] }).__events.push({
          event,
          props: options?.props ?? {},
        });
      };
  });
}

const events = (page: Page) =>
  page.evaluate(() => (window as unknown as { __events: CapturedEvent[] }).__events);

test.beforeEach(async ({ page }) => {
  await mockAnalytics(page);
});

test('copying an install command fires "Install command copied"', async ({ page }) => {
  await page.goto('/install');
  await page.getByTestId('copy-button').first().click();
  // CopyBlock.copy() awaits navigator.clipboard before track() fires; in headless CI that resolves
  // after the click promise, so poll for the event rather than reading immediately.
  await expect
    .poll(async () => (await events(page)).some((e) => e.event === 'Install command copied'))
    .toBe(true);
  const copy = (await events(page)).find((e) => e.event === 'Install command copied')!;
  expect(typeof copy.props.command).toBe('string');
});

test('the calculator fires "config pasted" and "install clicked", segmented by ref', async ({
  page,
}) => {
  // Arrive via a growth-channel link so the funnel is attributable.
  await page.goto('/mcp-token-calculator?ref=hackernews');

  await page.getByTestId('config-paste').fill('{ "mcpServers": { "a": {}, "b": {} } }');
  await page.getByTestId('config-load').click();

  // The internal install CTA is a client-side Link, so window (and __events) survive the navigation.
  await page.getByTestId('calculator-install-cta').click();

  const captured = await events(page);
  const pasted = captured.find((e) => e.event === 'Calculator config pasted');
  expect(pasted, 'config-pasted event').toBeTruthy();
  expect(pasted!.props.servers).toBe(2);
  expect(pasted!.props.ref, 'first-touch channel attribution').toBe('hackernews');

  const clicked = captured.find((e) => e.event === 'Install clicked');
  expect(clicked, 'install-clicked event').toBeTruthy();
  expect(clicked!.props.from).toBe('calculator');
  expect(clicked!.props.ref).toBe('hackernews');
});

test('outbound clicks to npm/GitHub fire "Outbound link" with the host', async ({ page }) => {
  await page.goto('/about');
  const npm = page.locator('a[href="https://www.npmjs.com/package/mcpfold"]').first();
  await expect(npm).toBeVisible();
  // The link opens in a new tab (target=_blank); the delegated listener records the event on click,
  // before the popup opens, so the current page keeps its captured events.
  await Promise.all([page.context().waitForEvent('page').catch(() => null), npm.click()]);

  const captured = await events(page);
  const out = captured.find((e) => e.event === 'Outbound link');
  expect(out, 'Outbound link event').toBeTruthy();
  expect(out!.props.host).toBe('www.npmjs.com');
});
