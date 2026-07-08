import { afterEach, describe, expect, it } from 'vitest';
import { ALL_ADAPTERS, registerAll } from '../src/all.js';
import { clearAdapters, listAdapters, requireAdapter } from '../src/registry.js';

afterEach(() => clearAdapters());

describe('registerAll (S2.1–S2.7)', () => {
  it('registers all client adapters', () => {
    registerAll();
    expect(listAdapters().map((a) => a.id)).toEqual([
      'claude-code',
      'claude-desktop',
      'cline',
      'cursor',
      'gemini-cli',
      'vscode',
      'windsurf',
      'zed',
    ]);
  });

  it('every adapter is reachable via requireAdapter', () => {
    registerAll();
    for (const adapter of ALL_ADAPTERS) {
      expect(requireAdapter(adapter.id).id).toBe(adapter.id);
    }
  });

  it('is idempotent', () => {
    registerAll();
    registerAll();
    expect(listAdapters()).toHaveLength(8);
  });
});
