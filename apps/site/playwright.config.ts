import { defineConfig, devices } from '@playwright/test';

// e2e runs against the Vite dev server (the marketing site is static — no auth, no backend).
// Test files are *.e2e.ts so the vitest workspace never collects them.
export default defineConfig({
  testDir: './test',
  testMatch: '**/*.e2e.ts',
  // The built-dist/no-JS suites run against the built output under playwright.prerender.config.ts,
  // not the dev server. (subscribe.e2e.ts is interactive and DOES run here.)
  testIgnore: [
    '**/prerender.e2e.ts',
    '**/guides.e2e.ts',
    '**/glossary.e2e.ts',
    '**/compare.e2e.ts',
    '**/seo.e2e.ts',
    '**/features.e2e.ts',
    '**/use-cases.e2e.ts',
    '**/about.e2e.ts',
    '**/legal.e2e.ts',
    '**/community.e2e.ts',
    '**/roadmap.e2e.ts',
    '**/notfound.e2e.ts',
  ],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'vite --port 5174 --strictPort',
    port: 5174,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
