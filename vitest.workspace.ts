import { defineWorkspace } from 'vitest/config';

/**
 * Vitest workspace — discovers every package that ships a vitest config, plus the
 * cross-cutting security suite (S9.1) which exercises the whole CLI end-to-end.
 * Each package owns its own `vitest.config.ts`; the root aggregates them so
 * `pnpm test` (via `pnpm -r test`) and a root `vitest run` both work.
 */
export default defineWorkspace([
  'packages/*',
  'apps/*',
  'services/*',
  './security/vitest.config.ts',
  './e2e/vitest.config.ts',
]);
