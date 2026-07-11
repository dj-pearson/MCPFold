import { describe, expect, it } from 'vitest';
import { loadConfig, loadConfigOrThrow, offsetToLineCol } from '../src/load.js';
import { SPEC_EXAMPLE_JSONC } from './fixtures/spec-example.js';

describe('loadConfig (S1.2)', () => {
  it('loads the spec §4 example including its // comments and trailing commas', () => {
    const res = loadConfig(SPEC_EXAMPLE_JSONC);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(Object.keys(res.config.servers)).toEqual(['github', 'supabase', 'playwright']);
      expect(res.config.servers.playwright?.pin).toBe('1.4.2');
      expect(Object.keys(res.config.profiles)).toContain('review-vscode');
    }
  });

  it('reports a positioned parse error for malformed JSONC', () => {
    const res = loadConfig('{ "version": 1, "servers": { ,, } }');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors[0]?.code).toBe('jsonc-parse');
      expect(res.errors[0]?.line).toBeGreaterThanOrEqual(1);
      expect(res.errors[0]?.column).toBeGreaterThanOrEqual(1);
    }
  });

  // S22.3: a body nested under __proto__ must NOT validate as an empty config (strict-schema bypass).
  describe('prototype-pollution keys (S22.3)', () => {
    it('rejects a config whose whole body is nested under __proto__', () => {
      const text = `{
  "__proto__": {
    "version": 2,
    "servers": { "github": { "transport": "stdio", "command": "npx" } }
  }
}`;
      const res = loadConfig(text);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.errors[0]?.code).toBe('schema');
        expect(res.errors[0]?.message).toMatch(/__proto__/);
        expect(res.errors[0]?.line).toBe(2);
      }
    });

    it('rejects a server literally named __proto__', () => {
      const text = `{
  "version": 2,
  "servers": { "__proto__": { "transport": "stdio", "command": "x" } }
}`;
      const res = loadConfig(text);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.errors[0]?.message).toMatch(/__proto__/);
    });

    it('rejects constructor and prototype keys anywhere', () => {
      expect(loadConfig('{ "constructor": { "version": 2 } }').ok).toBe(false);
      expect(loadConfig('{ "version": 2, "servers": { "prototype": {} } }').ok).toBe(false);
    });

    it('a normal config with no pollution keys is unaffected', () => {
      const res = loadConfig(
        '{ "version": 2, "servers": { "github": { "transport": "stdio", "command": "npx" } }, "profiles": {} }',
      );
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(Object.keys(res.config.servers)).toEqual(['github']);
        // The loaded config is a normal object with a real prototype (not polluted).
        expect(Object.getPrototypeOf(res.config)).toBe(Object.prototype);
      }
    });
  });

  // S22.6: a pathologically nested document must be a clean ok:false, never an uncaught RangeError.
  describe('recursion-depth limit (S22.6)', () => {
    it('returns a positioned error (not a throw) for deeply nested input', () => {
      const depth = 500; // well past the 64-level cap
      const text = '['.repeat(depth) + ']'.repeat(depth);
      let res;
      expect(() => (res = loadConfig(text))).not.toThrow();
      expect(res!.ok).toBe(false);
      if (!res!.ok) {
        expect(res!.errors[0]?.message).toMatch(/too deep/i);
        expect(res!.errors[0]?.line).toBeGreaterThanOrEqual(1);
      }
    });

    it('does not throw a RangeError even on ~200k levels of nesting', () => {
      const depth = 200_000;
      const text = '['.repeat(depth) + ']'.repeat(depth);
      let res;
      expect(() => (res = loadConfig(text))).not.toThrow();
      expect(res!.ok).toBe(false);
    });
  });

  it('returns a pathed zod error for invalid-but-parseable config', () => {
    const text = `{
  "version": 1,
  "servers": {
    "github": {
      "transport": "http",
      "auth": { "type": "bearer", "token": "hardcoded-token" }
    }
  },
  "profiles": {}
}`;
    const res = loadConfig(text);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      const tokenErr = res.errors.find((e) => e.path === 'servers.github.auth.token');
      expect(tokenErr).toBeDefined();
      expect(tokenErr?.code).toBe('schema');
      expect(tokenErr?.hint).toContain('${scheme:path}');
      // The error points at the token's line (line 6 in this source).
      expect(tokenErr?.line).toBe(6);
    }
  });

  it('maps the missing-url refine error to the offending server node', () => {
    const text = `{
  "version": 1,
  "servers": { "github": { "transport": "http" } },
  "profiles": {}
}`;
    const res = loadConfig(text);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.some((e) => e.message.includes('http/sse servers need `url`'))).toBe(true);
    }
  });

  it('flags the VS Code `servers`-vs-`mcpServers` style typo via strict unknown-key', () => {
    const text = `{ "version": 1, "servers": {}, "profiles": {}, "mcpServers": {} }`;
    const res = loadConfig(text);
    expect(res.ok).toBe(false);
  });

  describe('offsetToLineCol', () => {
    it('computes 1-based line/column across newlines', () => {
      const text = 'a\nbc\ndef';
      expect(offsetToLineCol(text, 0)).toEqual({ line: 1, column: 1 });
      expect(offsetToLineCol(text, 2)).toEqual({ line: 2, column: 1 });
      expect(offsetToLineCol(text, 5)).toEqual({ line: 3, column: 1 });
    });
  });

  describe('loadConfigOrThrow', () => {
    it('returns the config on success, auto-migrating the v1 fixture to v2 (S17.5)', () => {
      expect(loadConfigOrThrow(SPEC_EXAMPLE_JSONC).version).toBe(2);
    });
    it('throws an aggregate error listing issues on failure', () => {
      expect(() => loadConfigOrThrow('{ "version": 3 }')).toThrow(/Invalid mcp\.config\.jsonc/);
    });
  });
});
