import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { expect, test } from '@playwright/test';
import { renderHeadersFile, SECURITY_HEADERS } from '../src/security/headers';
import { generateInviteToken, isInviteExpired } from '../src/security/tokens';

const here = dirname(fileURLToPath(import.meta.url));
const headersFile = readFileSync(join(here, '../public/_headers'), 'utf8');

test.describe('security headers (S9.6)', () => {
  test('public/_headers matches the source of truth (drift guard)', () => {
    // Cloudflare Pages serves public/_headers verbatim; keep it in sync with headers.ts.
    expect(headersFile).toBe(renderHeadersFile());
  });

  test('every required security header is declared with the right value', () => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(headersFile).toContain(`${name}: ${value}`);
    }
    // The hardening essentials are present.
    expect(headersFile).toContain('Content-Security-Policy:');
    expect(headersFile).toContain("frame-ancestors 'none'");
    expect(headersFile).toContain('Strict-Transport-Security:');
    expect(headersFile).toContain('X-Content-Type-Options: nosniff');
    expect(headersFile).toContain('X-Frame-Options: DENY');
    expect(headersFile).toContain('Referrer-Policy: no-referrer');
  });
});

test.describe('invite tokens (S9.6)', () => {
  test('are high-entropy, unique, and expiring', () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    // 256 bits → 43-char base64url, URL-safe, and never colliding across calls.
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.token).not.toBe(b.token);
    expect(a.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  test('expiry is enforced', () => {
    const now = 1_700_000_000_000;
    const invite = generateInviteToken(60, now);
    expect(isInviteExpired(invite, now + 59_000)).toBe(false);
    expect(isInviteExpired(invite, now + 61_000)).toBe(true);
  });
});
