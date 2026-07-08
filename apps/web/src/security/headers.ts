/**
 * Web security headers (S9.6). The console is a static SPA on Cloudflare Pages, so headers are
 * declared in `public/_headers` (served verbatim by Pages). This module is the single source of
 * truth for that file; a test asserts the committed `_headers` matches {@link renderHeadersFile}.
 *
 * CSRF note: the SPA authenticates with a Bearer access token in the `Authorization` header (not
 * an ambient cookie), and the edge API requires that header — so cross-site requests can't ride a
 * session, and classic CSRF does not apply. `frame-ancestors 'none'` + `X-Frame-Options: DENY`
 * additionally prevent clickjacking of any state-changing UI.
 */

/** Origins the app talks to: Supabase (GoTrue/PostgREST) on api., and the edge API on functions. */
const SUPABASE_ORIGIN = 'https://api.mcpfold.com';
const EDGE_ORIGIN = 'https://functions.mcpfold.com';

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self' ${SUPABASE_ORIGIN} ${EDGE_ORIGIN}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/** The full security header set applied to every response. */
export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
};

/** Render the Cloudflare Pages `_headers` file content (applies to all paths). */
export function renderHeadersFile(): string {
  const lines = ['# Generated from src/security/headers.ts (S9.6). Do not edit by hand.', '/*'];
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    lines.push(`  ${name}: ${value}`);
  }
  return lines.join('\n') + '\n';
}
