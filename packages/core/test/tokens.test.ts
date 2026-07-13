import { describe, expect, it } from 'vitest';
import { estimateTokens, estimateToolTokens } from '../src/tokens.js';

/**
 * The committed benchmark token method (S5.4 / S24.6): 1 token ≈ 4 characters of serialized JSON.
 * Every user-facing estimate uses this, so it must stay exactly `ceil(len / 4)`.
 */
describe('estimateTokens', () => {
  it('is ceil(length / 4)', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abc')).toBe(1); // ceil(3/4)
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2); // ceil(5/4)
    expect(estimateTokens('x'.repeat(400))).toBe(100);
  });
});

describe('estimateToolTokens', () => {
  it('measures the serialized tool definition', () => {
    const tool = { name: 'search', description: 'find things', inputSchema: { type: 'object' } };
    const serialized = JSON.stringify(tool);
    expect(estimateToolTokens(tool)).toBe(Math.ceil(serialized.length / 4));
  });

  it('a bigger schema costs more tokens', () => {
    const small = { name: 'a' };
    const big = { name: 'a', description: 'x'.repeat(200), inputSchema: { type: 'object' } };
    expect(estimateToolTokens(big)).toBeGreaterThan(estimateToolTokens(small));
  });
});
