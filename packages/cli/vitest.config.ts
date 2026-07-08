import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Resolve @mcpfold/core to its TypeScript source so CLI tests run without a prior build
// (CI runs test before build). The build config (tsconfig.build.json) still resolves the
// real dist via node_modules, and pnpm builds core before cli topologically.
const coreSrc = fileURLToPath(new URL('../core/src/index.ts', import.meta.url));
const adaptersSrc = fileURLToPath(new URL('../adapters/src/index.ts', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@mcpfold/core': coreSrc,
      '@mcpfold/adapters': adaptersSrc,
    },
  },
  test: {
    name: 'cli',
    include: ['src/**/*.{test,spec}.ts', 'test/**/*.{test,spec}.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.{test,spec}.ts', 'src/bin.ts'],
    },
  },
});
