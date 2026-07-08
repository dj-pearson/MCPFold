import { defineConfig, devices } from '@playwright/test';

// S15.1: the prerender suite exercises the BUILT static output (dist/, served by `vite preview`),
// not the dev server — so it can assert real content in the no-JS HTML and verify hydration against
// the actual prerendered pages. Run after `pnpm --filter @mcpfold/site build`.
export default defineConfig({
  testDir: './test',
  testMatch: '**/prerender.e2e.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:4174',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // A clean-URL static server over dist/ (mirrors Cloudflare Pages) — NO SPA fallback, so a
    // missing prerender or hydration mismatch fails loudly instead of being masked.
    command: 'node scripts/serve-static.mjs',
    port: 4174,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
