import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Package-integrity verification for pinned stdio servers (S9.2). A server may declare an
 * optional SRI-style `integrity` hash (e.g. `sha512-…`) for the exact package a `pin` selects;
 * the fetched tarball's hash must match it. A mismatch means the registry served different bytes
 * than were approved — a supply-chain red flag — and is flagged.
 *
 * The comparison lives here (pure, testable); wiring the fetched-tarball bytes in happens at the
 * install/fetch layer.
 */

const SRI_RE = /^(sha256|sha384|sha512)-([A-Za-z0-9+/]+={0,2})$/;

export interface ParsedIntegrity {
  algorithm: 'sha256' | 'sha384' | 'sha512';
  digest: string; // base64
}

/** Parse an SRI string, or null if it is malformed. */
export function parseIntegrity(value: string): ParsedIntegrity | null {
  const m = SRI_RE.exec(value.trim());
  if (!m) return null;
  return { algorithm: m[1] as ParsedIntegrity['algorithm'], digest: m[2]! };
}

/** Compute the SRI string for `bytes` under `algorithm`. */
export function computeIntegrity(
  bytes: Uint8Array,
  algorithm: ParsedIntegrity['algorithm'] = 'sha512',
): string {
  const digest = createHash(algorithm).update(bytes).digest('base64');
  return `${algorithm}-${digest}`;
}

export type IntegrityResult = 'match' | 'mismatch' | 'malformed';

/** Verify `bytes` against a declared SRI `integrity`. */
export function verifyPackageIntegrity(integrity: string, bytes: Uint8Array): IntegrityResult {
  const parsed = parseIntegrity(integrity);
  if (!parsed) return 'malformed';
  const actual = createHash(parsed.algorithm).update(bytes).digest();
  const expected = Buffer.from(parsed.digest, 'base64');
  if (actual.length !== expected.length) return 'mismatch';
  return timingSafeEqual(actual, expected) ? 'match' : 'mismatch';
}
