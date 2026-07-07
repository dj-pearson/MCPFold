import { describe, expect, it } from 'vitest';
import { loadConfigOrThrow } from '@mcpfold/core';
import { redactConfig, redactRefPaths, Redactor } from '../src/util/redact.js';
import { buildDiagnoseBundle } from '../src/commands/diagnose.js';

const SENTINEL_SECRET = 'ghp_SUPERSECRETvalue1234567890';
const REF_PATH = 'dev/mcp/GITHUB_PAT';

const CONFIG_TEXT = `{
  "version": 1,
  "servers": {
    "github": {
      "transport": "http",
      "url": "https://api.githubcopilot.com/mcp/",
      "auth": {
        "type": "header",
        "token": "\${infisical:${REF_PATH}}",
        "headers": { "Authorization": "Bearer \${infisical:${REF_PATH}}", "X-Plain": "literalvalue" }
      },
      "env": { "API_KEY": "\${op:vault/item/field}", "HARDCODED": "${SENTINEL_SECRET}" },
      "tags": ["work"]
    }
  },
  "profiles": {}
}`;

describe('redactRefPaths (S0.6)', () => {
  it('keeps the scheme but strips the ref path', () => {
    expect(redactRefPaths('${infisical:dev/mcp/GITHUB_PAT}')).toBe('${infisical:***}');
    expect(redactRefPaths('Bearer ${env:TOKEN}')).toBe('Bearer ${env:***}');
  });
});

describe('Redactor sentinel scrubbing (S0.6)', () => {
  it('scrubs a registered secret verbatim from any string', () => {
    const r = new Redactor();
    r.register(SENTINEL_SECRET);
    expect(r.string(`value is ${SENTINEL_SECRET} here`)).toBe('value is *** here');
  });
});

describe('redactConfig — no secret value or ref path survives (S0.6)', () => {
  const config = loadConfigOrThrow(CONFIG_TEXT);

  it('redacts secret VALUES and provider ref PATHS', () => {
    const redactor = new Redactor();
    redactor.register(SENTINEL_SECRET);
    const redacted = JSON.stringify(redactConfig(config, redactor));

    // Neither the sentinel secret nor the ref path may appear anywhere.
    expect(redacted).not.toContain(SENTINEL_SECRET);
    expect(redacted).not.toContain(REF_PATH);
    expect(redacted).not.toContain('vault/item/field');
    // Schemes survive (they are useful, non-sensitive signal).
    expect(redacted).toContain('infisical');
  });
});

describe('diagnose bundle is provably leak-free (S0.6)', () => {
  it('contains no sentinel secret and no ref path', () => {
    const bundle = buildDiagnoseBundle({
      configPath: '/fake/mcp.config.jsonc',
      readFile: () => CONFIG_TEXT,
    });
    // Register the sentinel the same way the running CLI would once a value is resolved.
    const serialized = JSON.stringify(bundle);
    expect(serialized).not.toContain(SENTINEL_SECRET);
    expect(serialized).not.toContain(REF_PATH);
    expect(serialized).not.toContain('vault/item/field');
    expect(bundle.config).not.toBeNull();
  });
});
