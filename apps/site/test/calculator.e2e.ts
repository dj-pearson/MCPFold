import { expect, test } from '@playwright/test';

/**
 * S21.6 — /mcp-token-calculator (apps/site/src/calculator). The calculator is interactive, so this
 * runs against the Vite dev server (the default playwright.config.ts) with JS enabled: it asserts the
 * compute outputs, config-paste parsing, the keep slider, quick-add / remove, and the client-injected
 * WebApplication + FAQPage JSON-LD (Seo.tsx). Defaults: filesystem(11) + github(20) + supabase(15) +
 * playwright(10) = 56 tools, keep = 4.
 */

test.describe('/mcp-token-calculator', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/mcp-token-calculator');
    await expect(page.getByRole('heading', { name: 'MCP token calculator', level: 1 })).toBeVisible();
  });

  test('computes tools / tokens / reduction from the default presets', async ({ page }) => {
    // 4 presets, keep=4 → each server keeps min(4, count) → 4·4 = 16 of 56.
    await expect(page.getByTestId('tools-out')).toHaveText('56 → 16');
    await expect(page.getByTestId('keep-value')).toHaveText('4');
    // Tokens are a "before → after" pair of numbers, and the reduction is a positive percentage.
    await expect(page.getByTestId('tokens-out')).toHaveText(/[\d,]+ → [\d,]+/);
    const reduction = (await page.getByTestId('reduction-out').textContent())!.trim();
    expect(reduction).toMatch(/^\d+%$/);
    expect(Number(reduction.replace('%', ''))).toBeGreaterThan(0);
  });

  test('the keep slider changes the kept tools and the reduction', async ({ page }) => {
    // keep=20 ≥ every preset count → nothing trimmed → 56 → 56, 0% cut.
    await page.getByTestId('keep-slider').fill('20');
    await expect(page.getByTestId('keep-value')).toHaveText('20');
    await expect(page.getByTestId('tools-out')).toHaveText('56 → 56');
    await expect(page.getByTestId('reduction-out')).toHaveText('0%');
    // keep=0 → every tool trimmed.
    await page.getByTestId('keep-slider').fill('0');
    await expect(page.getByTestId('tools-out')).toHaveText('56 → 0');
  });

  test('paste-your-config parses server names; bad input errors without clobbering', async ({
    page,
  }) => {
    await page.getByTestId('config-paste').fill('{ "mcpServers": { "a": {}, "b": {} } }');
    await page.getByTestId('config-load').click();
    await expect(page.getByRole('status')).toContainText('Loaded 2 servers');
    await expect(page.getByTestId('row-0')).toBeVisible();
    await expect(page.getByTestId('row-1')).toBeVisible();
    await expect(page.getByTestId('row-2')).toHaveCount(0);
    // 2 pasted servers default to 15 tools each → 30 tools, keep=4 → 8.
    await expect(page.getByTestId('tools-out')).toHaveText('30 → 8');

    // Invalid JSON surfaces an error and leaves the loaded servers in place.
    await page.getByTestId('config-paste').fill('not json at all');
    await page.getByTestId('config-load').click();
    await expect(page.getByRole('status')).toContainText('Could not parse');
    await expect(page.getByTestId('row-1')).toBeVisible();
  });

  test('quick-add and remove change the server list', async ({ page }) => {
    // Defaults render rows 0..3; there is no row-4 yet.
    await expect(page.getByTestId('row-3')).toBeVisible();
    await expect(page.getByTestId('row-4')).toHaveCount(0);

    await page.getByRole('button', { name: '+ slack' }).click();
    await expect(page.getByTestId('row-4')).toBeVisible(); // added a 5th server

    // Removing a default preset drops a row back.
    await page.getByRole('button', { name: 'Remove github' }).click();
    await expect(page.getByTestId('row-4')).toHaveCount(0);
  });

  test('emits WebApplication + FAQPage JSON-LD (client-injected by Seo.tsx)', async ({ page }) => {
    await page.waitForFunction(
      () =>
        document.querySelectorAll('script[type="application/ld+json"][data-route-head]').length > 0,
    );
    const types = await page.evaluate(() =>
      [...document.querySelectorAll('script[type="application/ld+json"][data-route-head]')].map(
        (s) => {
          try {
            return (JSON.parse(s.textContent || '{}') as { '@type'?: string })['@type'];
          } catch {
            return null;
          }
        },
      ),
    );
    expect(types).toContain('WebApplication');
    expect(types).toContain('FAQPage');
  });
});
