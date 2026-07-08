/**
 * High-entropy invite / share tokens (S9.6), consumed by the team console (S7.6). Tokens are
 * 256-bit (base64url), single-use (marked used on redemption, server-side), and expiring. This
 * module owns generation + the expiry contract; single-use enforcement is a server-side check
 * against the stored token.
 */

export interface InviteToken {
  /** The secret token — 43-char base64url (256 bits of entropy). Share once, over TLS. */
  token: string;
  /** Unix seconds after which the token is invalid. */
  expiresAt: number;
}

/** Default invite lifetime: 7 days. */
export const DEFAULT_INVITE_TTL_SECONDS = 60 * 60 * 24 * 7;

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

/** Generate a fresh, high-entropy, expiring invite token. */
export function generateInviteToken(
  ttlSeconds: number = DEFAULT_INVITE_TTL_SECONDS,
  nowMs: number = Date.now(),
): InviteToken {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return { token: base64url(bytes), expiresAt: Math.floor(nowMs / 1000) + ttlSeconds };
}

/** Whether a token has expired. */
export function isInviteExpired(invite: InviteToken, nowMs: number = Date.now()): boolean {
  return invite.expiresAt * 1000 <= nowMs;
}
