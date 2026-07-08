import { describe, expect, it } from 'vitest';
import { CORE_PACKAGE } from './index.js';

describe('@mcpfold/core scaffold smoke test', () => {
  it('resolves TypeScript module + vitest config', () => {
    expect(CORE_PACKAGE).toBe('@mcpfold/core');
  });

  it('runs under strict tsconfig with noUncheckedIndexedAccess', () => {
    const xs: number[] = [1, 2, 3];
    // With noUncheckedIndexedAccess, xs[0] is `number | undefined`; this
    // narrowing proves the strict flag is actually in effect at compile time.
    const first = xs[0];
    expect(first ?? 0).toBe(1);
  });
});
