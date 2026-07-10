import { defineConfig, devices } from '@playwright/test';

// e2e runs against the Vite dev server (the marketing site is static — no auth, no backend).
// Test files are *.e2e.ts so the vitest workspace never collects them.
export default defineConfig({
  testDir: './test',
  testMatch: '**/*.e2e.ts',
  // The prerender suite runs against the built static output (vite preview), not the dev server —
  // it has its own config (playwright.prerender.config.ts).
  testIgnore: ['**/prerender.e2e.ts', '**/features.e2e.ts'],
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
