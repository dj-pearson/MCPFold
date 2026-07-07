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
    it('returns the config on success', () => {
      expect(loadConfigOrThrow(SPEC_EXAMPLE_JSONC).version).toBe(1);
    });
    it('throws an aggregate error listing issues on failure', () => {
      expect(() => loadConfigOrThrow('{ "version": 3 }')).toThrow(/Invalid mcp\.config\.jsonc/);
    });
  });
});
