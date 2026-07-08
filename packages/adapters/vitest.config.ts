import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const coreSrc = fileURLToPath(new URL('../core/src/index.ts', import.meta.url));

export default defineConfig({
  resolve: { alias: { '@mcpfold/core': coreSrc } },
  test: {
    name: 'adapters',
    include: ['src/**/*.{test,spec}.ts', 'test/**/*.{test,spec}.ts'],
    environment: 'node',
    coverage: { provider: 'v8', include: ['src/**/*.ts'], exclude: ['src/**/*.{test,spec}.ts'] },
  },
});
