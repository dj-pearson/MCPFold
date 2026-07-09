import { afterEach, describe, expect, it } from 'vitest';
import {
  clearAdapters,
  getAdapter,
  listAdapters,
  registerAdapter,
  requireAdapter,
} from '../src/registry.js';
import { createMcpServersAdapter } from '../src/shared.js';

const makeAdapter = (id: 'cursor' | 'zed') =>
  createMcpServersAdapter({
    id,
    remote: { nativeHttp: true, nativeOauth: true, fieldShape: 'url' },
    resolvePath: () => `/tmp/${id}.json`,
  });

afterEach(() => clearAdapters());

describe('adapter registry (S2.1)', () => {
  it('registers and looks up by id', () => {
    const cursor = makeAdapter('cursor');
    registerAdapter(cursor);
    expect(getAdapter('cursor')).toBe(cursor);
    expect(getAdapter('missing')).toBeUndefined();
  });

  it('requireAdapter throws a descriptive error when missing', () => {
    registerAdapter(makeAdapter('cursor'));
    expect(() => requireAdapter('zed')).toThrow(/No adapter registered for client "zed".*cursor/s);
  });

  it('lists adapters deterministically by id', () => {
    registerAdapter(makeAdapter('zed'));
    registerAdapter(makeAdapter('cursor'));
    expect(listAdapters().map((a) => a.id)).toEqual(['cursor', 'zed']);
  });
});
