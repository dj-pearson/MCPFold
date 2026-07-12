import { describe, expect, it } from 'vitest';
import { colorEnabled, createStyle, symbols } from '../src/util/style.js';

describe('colorEnabled (S23.1)', () => {
  it('is on for a TTY with a clean environment', () => {
    expect(colorEnabled({}, true)).toBe(true);
  });

  it('is off when not attached to a TTY', () => {
    expect(colorEnabled({}, false)).toBe(false);
  });

  it('honors NO_COLOR (any non-empty value) regardless of TTY', () => {
    expect(colorEnabled({ NO_COLOR: '1' }, true)).toBe(false);
    expect(colorEnabled({ NO_COLOR: 'anything' }, true)).toBe(false);
    // An empty NO_COLOR is not a disable signal.
    expect(colorEnabled({ NO_COLOR: '' }, true)).toBe(true);
  });

  it('honors the product-specific MCPFOLD_NO_COLOR opt-out', () => {
    expect(colorEnabled({ MCPFOLD_NO_COLOR: '1' }, true)).toBe(false);
    expect(colorEnabled({ MCPFOLD_NO_COLOR: 'true' }, true)).toBe(false);
  });

  it('treats TERM=dumb as no color', () => {
    expect(colorEnabled({ TERM: 'dumb' }, true)).toBe(false);
  });

  it('FORCE_COLOR bypasses the TTY check, and FORCE_COLOR=0 forces off', () => {
    expect(colorEnabled({ FORCE_COLOR: '1' }, false)).toBe(true);
    expect(colorEnabled({ FORCE_COLOR: '0' }, true)).toBe(false);
    expect(colorEnabled({ FORCE_COLOR: 'false' }, true)).toBe(false);
  });

  it('an explicit disable wins over FORCE_COLOR', () => {
    expect(colorEnabled({ FORCE_COLOR: '1', NO_COLOR: '1' }, true)).toBe(false);
  });
});

describe('createStyle', () => {
  it('emits wrapping ANSI codes when enabled and preserves the payload', () => {
    const s = createStyle(true);
    const out = s.green('ok');
    expect(out).toBe('\x1b[32mok\x1b[0m');
    expect(out).toContain('ok');
  });

  it('is the identity function when disabled — no escape codes leak', () => {
    const s = createStyle(false);
    expect(s.green('ok')).toBe('ok');
    expect(s.bold(s.red('nested'))).toBe('nested');
    // eslint-disable-next-line no-control-regex
    expect(s.yellow('x')).not.toMatch(/\x1b/);
  });

  it('exposes the enabled flag', () => {
    expect(createStyle(true).enabled).toBe(true);
    expect(createStyle(false).enabled).toBe(false);
  });

  it('ships a stable set of semantic glyphs', () => {
    expect(symbols.ok).toBe('✓');
    expect(symbols.err).toBe('✖');
    expect(symbols.warn).toBe('⚠');
    expect(symbols.arrow).toBe('→');
  });
});
