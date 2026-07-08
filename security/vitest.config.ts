import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@mcpfold/core': src('../packages/core/src/index.ts'),
      '@mcpfold/adapters': src('../packages/adapters/src/index.ts'),
      '@mcpfold/secrets': src('../packages/secrets/src/index.ts'),
      mcpfold: src('../packages/cli/src/index.ts'),
    },
  },
  test: { name: 'security', include: ['**/*.{test,spec}.ts'], environment: 'node' },
});
