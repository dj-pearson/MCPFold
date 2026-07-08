import { describe, expect, it } from 'vitest';
import { UsageError } from '@mcpfold/core';
import { scaffoldAdapter } from '../src/commands/scaffold-adapter.js';

/** Capture writes in-memory so the test needs no real filesystem. */
function harness(existing: string[] = ['/repo/packages/adapters/src']) {
  const written = new Map<string, string>();
  const dirs = new Set(existing);
  return {
    written,
    dirs,
    opts: {
      adaptersRoot: '/repo/packages/adapters',
      writeFile: (p: string, c: string) => written.set(p, c),
      exists: (p: string) => dirs.has(p) || written.has(p),
      mkdir: (p: string) => dirs.add(p),
    },
  };
}

describe('scaffoldAdapter (S0.5)', () => {
  it('generates a compiling adapter module + test + fixture dir', () => {
    const h = harness();
    const result = scaffoldAdapter({ name: 'continue', ...h.opts });

    const modulePath = '/repo/packages/adapters/src/continue.ts';
    const testPath = '/repo/packages/adapters/test/continue.test.ts';
    expect(h.written.has(modulePath)).toBe(true);
    expect(h.written.has(testPath)).toBe(true);

    const module = h.written.get(modulePath)!;
    // The adapter uses the factory, is typed as a ClientId, and defaults to the shim strategy.
    expect(module).toContain('createMcpServersAdapter');
    expect(module).toContain("id: 'continue' as ClientId");
    expect(module).toContain("secretStrategy: 'shim'");
    expect(module).toContain('export const continueAdapter');

    // The generated test proves registry pickup.
    expect(h.written.get(testPath)).toContain('registerAdapter(continueAdapter)');

    expect(result.data.checklist[0]).toContain('CLIENT_IDS');
    expect(result.data.checklist[1]).toContain('ALL_ADAPTERS');
  });

  it('rejects an invalid name', () => {
    const h = harness();
    expect(() => scaffoldAdapter({ name: 'Bad Name', ...h.opts })).toThrow(UsageError);
  });

  it('refuses to overwrite an existing adapter', () => {
    const h = harness(['/repo/packages/adapters/src', '/repo/packages/adapters/src/cursor.ts']);
    expect(() => scaffoldAdapter({ name: 'cursor', ...h.opts })).toThrow(/already exists/);
  });

  it('errors when run outside the repo (no adapters package)', () => {
    const h = harness([]); // src dir does not exist
    expect(() => scaffoldAdapter({ name: 'continue', ...h.opts })).toThrow(
      /Adapters package not found/,
    );
  });
});
