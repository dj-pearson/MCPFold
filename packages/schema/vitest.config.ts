import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
const coreSrc = fileURLToPath(new URL('../core/src/index.ts', import.meta.url));
export default defineConfig({
  resolve: { alias: { '@mcpfold/core': coreSrc } },
  test: { name: 'schema', include: ['test/**/*.{test,spec}.ts'], environment: 'node' },
});
