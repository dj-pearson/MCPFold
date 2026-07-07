import { defineWorkspace } from 'vitest/config';

/**
 * Vitest workspace — discovers every package that ships a vitest config.
 * Each package owns its own `vitest.config.ts`; the root aggregates them so
 * `pnpm test` (via `pnpm -r test`) and a root `vitest run` both work.
 */
export default defineWorkspace(['packages/*', 'apps/*', 'services/*']);
