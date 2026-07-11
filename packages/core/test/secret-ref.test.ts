import { describe, expect, it } from 'vitest';
import {
  findSecretRefs,
  findSecretRefsInString,
  isSecretRef,
  parseSecretRef,
} from '../src/secret-ref.js';
import type { ServerConfig } from '../src/types.js';

describe('parseSecretRef (S1.3)', () => {
  it('parses refs across every known scheme', () => {
    for (const [ref, scheme, path] of [
      ['${env:GITHUB_PAT}', 'env', 'GITHUB_PAT'],
      ['${dotenv:TOKEN}', 'dotenv', 'TOKEN'],
      ['${infisical:dev/mcp/GITHUB_PAT}', 'infisical', 'dev/mcp/GITHUB_PAT'],
      ['${keychain:mcp/github}', 'keychain', 'mcp/github'],
      ['${op:vault/item/field}', 'op', 'vault/item/field'],
    ] as const) {
      const parsed = parseSecretRef(ref);
      expect(parsed).toEqual({ scheme, path, known: true, raw: ref });
    }
  });

  it('returns null for non-refs', () => {
    expect(parseSecretRef('ghp_hardcoded')).toBeNull();
    expect(parseSecretRef('${nocolon}')).toBeNull();
    expect(parseSecretRef('')).toBeNull();
  });

  it('returns null for a string that merely contains a ref (partial)', () => {
    expect(parseSecretRef('Bearer ${env:X}')).toBeNull();
  });

  it('parses an unknown scheme with known:false rather than crashing', () => {
    const parsed = parseSecretRef('${vault:secret/path}');
    expect(parsed).toEqual({
      scheme: 'vault',
      path: 'secret/path',
      known: false,
      raw: '${vault:secret/path}',
    });
  });

  it('isSecretRef reflects whole-string matching', () => {
    expect(isSecretRef('${env:X}')).toBe(true);
    expect(isSecretRef('Bearer ${env:X}')).toBe(false);
  });

  // S22.22: whole-string and embedded parsing use the same non-`}` path class, so they agree that a
  // path never contains a brace — previously the whole matcher's greedy `.+` yielded `a}b`.
  it('whole-string and embedded parsing agree on the ambiguous ${env:a}b}', () => {
    // The whole string is NOT a single clean ref (the trailing `b}` disqualifies it).
    expect(isSecretRef('${env:a}b}')).toBe(false);
    expect(parseSecretRef('${env:a}b}')).toBeNull();
    // Embedded scan finds `${env:a}` with path `a` (never `a}b`).
    const refs = findSecretRefsInString('${env:a}b}');
    expect(refs.map((r) => r.raw)).toEqual(['${env:a}']);
    expect(refs[0]?.path).toBe('a');
  });
});

describe('findSecretRefsInString (S1.3)', () => {
  it('finds embedded refs, including in composite header values', () => {
    const refs = findSecretRefsInString('Bearer ${env:A} and ${infisical:b/c}');
    expect(refs.map((r) => r.raw)).toEqual(['${env:A}', '${infisical:b/c}']);
    expect(refs[0]?.scheme).toBe('env');
    expect(refs[1]?.path).toBe('b/c');
  });

  it('returns [] for a plain string', () => {
    expect(findSecretRefsInString('no secrets here')).toEqual([]);
  });
});

describe('findSecretRefs(server) (S1.3)', () => {
  it('enumerates refs across auth.token, nested headers, and env', () => {
    const server: ServerConfig = {
      transport: 'streamable-http',
      url: 'https://x.test/mcp',
      auth: {
        type: 'header',
        token: '${env:TOKEN}',
        headers: { Authorization: 'Bearer ${infisical:dev/X}', 'X-Api': '${keychain:k}' },
      },
      env: { API_KEY: '${op:vault/item/field}', PLAIN: 'literal' },
      tags: [],
    };
    const refs = findSecretRefs(server);
    const byLocation = Object.fromEntries(refs.map((r) => [r.location, r.raw]));
    expect(byLocation['auth.token']).toBe('${env:TOKEN}');
    expect(byLocation['auth.headers.Authorization']).toBe('${infisical:dev/X}');
    expect(byLocation['auth.headers.X-Api']).toBe('${keychain:k}');
    expect(byLocation['env.API_KEY']).toBe('${op:vault/item/field}');
    // A literal env value contributes no ref.
    expect(refs.some((r) => r.location === 'env.PLAIN')).toBe(false);
  });

  it('returns [] for a server with no secrets', () => {
    const server: ServerConfig = { transport: 'stdio', command: 'npx', tags: [] };
    expect(findSecretRefs(server)).toEqual([]);
  });
});
