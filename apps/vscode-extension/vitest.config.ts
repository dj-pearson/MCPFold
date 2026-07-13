import { defineConfig } from 'vitest/config';

// Unit tests for the extension's pure modules (e.g. tokenBudget.ts). The vscode-facing code is
// smoke-tested manually in an Extension Development Host (S21.1); only dependency-free logic is
// exercised here so it runs in a plain Node environment under the workspace runner.
export default defineConfig({
  test: {
    name: 'vscode-extension',
    include: ['test/**/*.{test,spec}.ts', 'src/**/*.{test,spec}.ts'],
    environment: 'node',
  },
});
