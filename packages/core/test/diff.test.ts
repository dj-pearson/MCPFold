import { describe, expect, it } from 'vitest';
import { diffRendered, type ParseCapable } from '../src/diff.js';

/**
 * A tiny fake adapter: parses a JSON object of `{ name: { transport, url?, command?, token? } }`
 * into a canonical partial. Stands in for a real ClientAdapter's parse().
 */
const fakeParser: ParseCapable = {
  parse(contents: string) {
    const raw = JSON.parse(contents) as Record<string, Record<string, unknown>>;
    const servers: Record<string, Record<string, unknown>> = {};
    for (const [name, e] of Object.entries(raw)) {
      servers[name] = { transport: e.url ? 'http' : 'stdio', ...e, tags: [] };
    }
    return { servers } as ReturnType<ParseCapable['parse']>;
  },
};

const rendered = (obj: unknown) => ({ contents: JSON.stringify(obj) });

describe('diffRendered (S1.6)', () => {
  it('identical semantic config → empty diff, no drift (ignores key order)', () => {
    const expected = rendered({ github: { url: 'https://x/mcp', token: 'a' } });
    // Same data, different key order + whitespace.
    const actual = JSON.stringify({ github: { token: 'a', url: 'https://x/mcp' } }, null, 4);
    const diff = diffRendered(expected, actual, fakeParser);
    expect(diff.hasDrift).toBe(false);
    expect(diff.servers).toEqual([]);
    expect(diff.fileMissing).toBe(false);
  });

  it('changed field → a `changed` server diff with the field listed', () => {
    const expected = rendered({ github: { url: 'https://x/mcp', token: 'NEW' } });
    const actual = JSON.stringify({ github: { url: 'https://x/mcp', token: 'OLD' } });
    const diff = diffRendered(expected, actual, fakeParser);
    expect(diff.hasDrift).toBe(true);
    expect(diff.servers).toHaveLength(1);
    expect(diff.servers[0]?.status).toBe('changed');
    expect(diff.servers[0]?.changes).toContainEqual({
      field: 'token',
      expected: 'NEW',
      actual: 'OLD',
    });
  });

  it('server present in canonical but not on disk → `added`', () => {
    const expected = rendered({ a: { url: 'u' }, b: { url: 'v' } });
    const actual = JSON.stringify({ a: { url: 'u' } });
    const diff = diffRendered(expected, actual, fakeParser);
    expect(diff.servers).toEqual([{ name: 'b', status: 'added' }]);
    expect(diff.hasDrift).toBe(true);
  });

  it('extra server on disk → `unmanaged` flag', () => {
    const expected = rendered({ a: { url: 'u' } });
    const actual = JSON.stringify({ a: { url: 'u' }, extra: { url: 'z' } });
    const diff = diffRendered(expected, actual, fakeParser);
    expect(diff.servers).toEqual([{ name: 'extra', status: 'unmanaged' }]);
    expect(diff.hasDrift).toBe(true);
  });

  it('missing file → fileMissing + every expected server added', () => {
    const expected = rendered({ a: { url: 'u' }, b: { command: 'npx' } });
    const diff = diffRendered(expected, undefined, fakeParser);
    expect(diff.fileMissing).toBe(true);
    expect(diff.hasDrift).toBe(true);
    expect(diff.servers.map((s) => s.name)).toEqual(['a', 'b']);
    expect(diff.servers.every((s) => s.status === 'added')).toBe(true);
  });
});
