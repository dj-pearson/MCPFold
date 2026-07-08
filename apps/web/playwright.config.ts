import { defineConfig, devices } from '@playwright/test';

// e2e runs against a Vite dev server with VITE_E2E=1 (mock auth), so the login flow and gated
// redirect are tested deterministically without a live Supabase. Test files are *.e2e.ts so the
// vitest workspace never collects them.
export default defineConfig({
  testDir: './test',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'vite --port 5173 --strictPort',
    port: 5173,
    env: { VITE_E2E: '1' },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
