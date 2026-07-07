import { describe, expect, it } from 'vitest';
import { ConfigValidationError, DriftError, isMcpfoldError, McpfoldError } from '../src/errors.js';
import { UnknownProfileError } from '../src/resolve.js';

describe('McpfoldError hierarchy (S0.6)', () => {
  it('carries a stable code and optional hint', () => {
    const err = new ConfigValidationError('bad config', { hint: 'fix version' });
    expect(err.code).toBe('CONFIG_VALIDATION');
    expect(err.hint).toBe('fix version');
    expect(err.message).toBe('bad config');
    expect(err.name).toBe('ConfigValidationError');
  });

  it('preserves the error cause', () => {
    const cause = new Error('root');
    const err = new DriftError('drift detected', { cause });
    expect(err.cause).toBe(cause);
    expect(err.code).toBe('DRIFT');
  });

  it('isMcpfoldError narrows the family', () => {
    expect(isMcpfoldError(new ConfigValidationError('x'))).toBe(true);
    expect(isMcpfoldError(new Error('plain'))).toBe(false);
    expect(isMcpfoldError('nope')).toBe(false);
  });

  it('UnknownProfileError is part of the hierarchy with UNKNOWN_PROFILE code', () => {
    const err = new UnknownProfileError('nope', ['work-cursor']);
    expect(err).toBeInstanceOf(McpfoldError);
    expect(err.code).toBe('UNKNOWN_PROFILE');
    expect(isMcpfoldError(err)).toBe(true);
  });
});
