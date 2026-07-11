import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfigOrThrow } from '@mcpfold/core';
import { maskTokens, redactConfig, redactRefPaths, Redactor } from '../src/util/redact.js';
import { buildDiagnoseBundle } from '../src/commands/diagnose.js';
import { backupIfExists } from '../src/io/backup.js';

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

describe('maskTokens (S9.3)', () => {
  it('masks known provider token prefixes', () => {
    expect(maskTokens('use ghp_abcdef1234567890ABCDEF here')).toBe('use *** here');
    expect(maskTokens('Bearer sk-ant-api03-xyz123456789')).toContain('***');
  });
  // S22.22: GitHub fine-grained PATs and Stripe secret keys must be masked by the known-prefix rule.
  it('masks github_pat_ and Stripe sk_live_/sk_test_ prefixes', () => {
    expect(maskTokens('key github_pat_11ABCDE0123456789_abcdefXYZ end')).toBe('key *** end');
    expect(maskTokens('stripe sk_live_abcdEFGH12345678 done')).toBe('stripe *** done');
    expect(maskTokens('stripe sk_test_abcdEFGH12345678 done')).toBe('stripe *** done');
  });
  it('masks a high-entropy blob with letters + digits', () => {
    expect(maskTokens('token=aB3xK9mZ2pQ7wL5nR8tV4jH6')).toBe('token=***');
  });
  it('leaves refs and plain URLs/prose alone', () => {
    expect(maskTokens('${infisical:dev/mcp/GITHUB_PAT}')).toBe('${infisical:dev/mcp/GITHUB_PAT}');
    expect(maskTokens('https://api.githubcopilot.com/mcp/')).toBe(
      'https://api.githubcopilot.com/mcp/',
    );
    expect(maskTokens('the quick brown fox')).toBe('the quick brown fox');
  });
  it('Redactor.string applies masking too', () => {
    expect(new Redactor().string('leak ghp_abcdef1234567890ABCDEF')).toBe('leak ***');
  });
});

describe('backup hardening (S9.3)', () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('creates the backup 0600 on POSIX', () => {
    dir = mkdtempSync(join(tmpdir(), 'mcpfold-bak-'));
    const target = join(dir, 'mcp.json');
    writeFileSync(target, '{"secret":"inlined"}');
    chmodSync(target, 0o644);
    const backup = backupIfExists(target, new Date('2026-07-08T00:00:00Z'));
    expect(backup).toContain('.mcpfold.bak.');
    if (process.platform !== 'win32') {
      expect(statSync(backup!).mode & 0o777).toBe(0o600);
    }
    // The backup content matches the original (it is a copy, just locked down).
    expect(readFileSync(backup!, 'utf8')).toBe('{"secret":"inlined"}');
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
