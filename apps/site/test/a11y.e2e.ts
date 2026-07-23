import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Automated accessibility rule engine (compliance audit follow-up A7). Runs axe-core against the
 * BUILT, prerendered pages (served by scripts/serve-static.mjs via playwright.prerender.config.ts)
 * across the WCAG 2.0/2.1/2.2 A + AA rule tags, and fails on any serious/critical violation. This
 * complements the Lighthouse accessibility budget with concrete, per-rule assertions and guards the
 * WCAG 2.2 AA claim on /accessibility against regressions (e.g. a contrast or landmark slip).
 *
 * We gate on impact serious+critical so the suite stays actionable; moderate/minor advisories are
 * left to Lighthouse and manual review.
 */

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

// A representative page of each major template: home, a content/legal page, the new accessibility
// statement, a form-bearing page, a data-dense list, and pricing.
const PAGES = ['/', '/privacy', '/accessibility', '/install', '/directory', '/pricing'] as const;

for (const path of PAGES) {
  test(`${path}: no serious or critical axe violations (WCAG 2.2 A/AA)`, async ({ page }) => {
    await page.goto(path);
    // Ensure hydration has attached before scanning (a shared header control).
    await expect(page.getByTestId('theme-toggle')).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    const summary = blocking.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
    expect(blocking, `axe violations on ${path}:\n${JSON.stringify(summary, null, 2)}`).toEqual([]);
  });
}
