import { describe, expect, it } from 'vitest';
import { isByteIdentical, serialize, sortKeysDeep } from '../src/serialize.js';

describe('serialize (S0.8) — determinism invariant', () => {
  it('emits sorted keys, 2-space indent, and a trailing newline', () => {
    const out = serialize({ b: 1, a: 2 });
    expect(out).toBe('{\n  "a": 2,\n  "b": 1\n}\n');
    expect(out.endsWith('\n')).toBe(true);
  });

  it('renders the same input byte-identically twice', () => {
    const input = { servers: { github: { url: 'x', tags: ['work'] } }, version: 1 };
    expect(serialize(input)).toBe(serialize(input));
  });

  it('yields identical output for shuffled-key input (shuffle-invariant)', () => {
    const a = { version: 1, servers: { z: { b: 2, a: 1 }, m: { d: 4, c: 3 } } };
    const b = { servers: { m: { c: 3, d: 4 }, z: { a: 1, b: 2 } }, version: 1 };
    expect(serialize(a)).toBe(serialize(b));
  });

  it('PRESERVES array order (args order is significant)', () => {
    const out = serialize({ args: ['-y', '@playwright/mcp@latest', '--headless'] });
    expect(out).toContain('"-y"');
    // Order must be preserved, not sorted.
    expect(JSON.parse(out).args).toEqual(['-y', '@playwright/mcp@latest', '--headless']);
  });

  it('respects a custom indent', () => {
    expect(serialize({ a: 1 }, { indent: 4 })).toBe('{\n    "a": 1\n}\n');
  });

  describe('property: shuffling keys never changes output', () => {
    it('holds across many random key permutations', () => {
      const base: Record<string, number> = { alpha: 1, beta: 2, gamma: 3, delta: 4, epsilon: 5 };
      const canonical = serialize(base);
      // Deterministic pseudo-shuffle (no Math.random — reproducible).
      const keys = Object.keys(base);
      for (let seed = 0; seed < 20; seed++) {
        const shuffled: Record<string, number> = {};
        const order = [...keys].sort(
          (x, y) => ((x.length * (seed + 1)) % 7) - ((y.length * (seed + 3)) % 7),
        );
        for (const k of order) shuffled[k] = base[k]!;
        expect(serialize(shuffled)).toBe(canonical);
      }
    });
  });

  it('sortKeysDeep leaves primitives and arrays structurally intact', () => {
    expect(sortKeysDeep(5)).toBe(5);
    expect(sortKeysDeep('x')).toBe('x');
    expect(sortKeysDeep([3, 1, 2])).toEqual([3, 1, 2]);
  });

  it('isByteIdentical compares exactly', () => {
    expect(isByteIdentical('a\n', 'a\n')).toBe(true);
    expect(isByteIdentical('a\n', 'a')).toBe(false);
  });
});
