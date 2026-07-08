import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Deployment bootstrap guards (S8.5). Proves the two operator-facing artifacts actually work:
 *   - scripts/gen-cloud-env.sh mints a valid Supabase ANON_KEY (real HS256 JWT signed with the
 *     JWT_SECRET it generated — the shared trust anchor), and
 *   - scripts/check-deploy-env.mjs flags drift between the runbook's env matrix and the real
 *     sources (passes today; trips on a planted mismatch).
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GEN = join(ROOT, 'scripts', 'gen-cloud-env.sh');
const CHECK = join(ROOT, 'scripts', 'check-deploy-env.mjs');
const DOC = join(ROOT, 'docs', 'deployment.md');

function have(cmd: string): boolean {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** base64url → utf8/JSON, tolerant of missing padding. */
function b64urlJson(seg: string): Record<string, unknown> {
  const b64 = seg.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

describe('gen-cloud-env.sh mints a valid Supabase JWT (S8.5)', () => {
  // Requires a POSIX shell + openssl; the Windows CI leg skips (the ubuntu/macos legs cover it).
  it.skipIf(!have('bash') || !have('openssl'))(
    'ANON_KEY verifies against the generated JWT_SECRET',
    () => {
      const out = execFileSync('bash', [GEN], { encoding: 'utf8' });
      const jwtSecret = /^JWT_SECRET=(.+)$/m.exec(out)?.[1]?.trim();
      const anonKey = /^ANON_KEY=(.+)$/m.exec(out)?.[1]?.trim();
      expect(jwtSecret, 'JWT_SECRET in output').toBeTruthy();
      expect(anonKey, 'ANON_KEY in output').toBeTruthy();

      const [header, payload, signature] = anonKey!.split('.');
      expect([header, payload, signature].every(Boolean), 'three JWT segments').toBe(true);

      // Signature: HS256 over header.payload with the generated secret must match.
      const expected = createHmac('sha256', jwtSecret!)
        .update(`${header}.${payload}`)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      expect(signature).toBe(expected);

      // Claims: a Supabase anon key for our issuer, not yet expired.
      const claims = b64urlJson(payload!);
      expect(claims.role).toBe('anon');
      expect(claims.iss).toBe('supabase');
      expect(Number(claims.exp)).toBeGreaterThan(Math.floor(Date.now() / 1000));
      expect(b64urlJson(header!).alg).toBe('HS256');
    },
  );
});

describe('check-deploy-env.mjs — runbook env matrix drift (S8.5)', () => {
  it('passes on the real tree (every source var is documented)', () => {
    // Throws (non-zero exit) if there is drift — reaching here means it passed.
    const out = execFileSync(process.execPath, [CHECK], { encoding: 'utf8' });
    expect(out).toMatch(/in sync/);
  });

  it('trips when a documented var is removed (planted mismatch)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcpfold-deploy-env-'));
    try {
      // Drop every documentation of PORT (an edge var the service really reads) → drift.
      const doctored = readFileSync(DOC, 'utf8')
        .split(/\r?\n/)
        .filter((line) => !/`PORT`/.test(line))
        .join('\n');
      const docPath = join(dir, 'deployment.md');
      writeFileSync(docPath, doctored);

      let failed = false;
      let stderr = '';
      try {
        execFileSync(process.execPath, [CHECK, '--doc', docPath], { encoding: 'utf8' });
      } catch (e) {
        failed = true;
        stderr = String((e as { stderr?: Buffer }).stderr ?? '');
      }
      expect(failed, 'checker should exit non-zero on drift').toBe(true);
      expect(stderr).toMatch(/PORT/);
      expect(stderr).toMatch(/out of sync/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
