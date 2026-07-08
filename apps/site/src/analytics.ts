/**
 * Privacy-friendly analytics (S13.1). Cookieless, no PII, no cross-site tracking — designed for a
 * Plausible/Umami-style endpoint. It is OFF by default and only loads when the site is built with
 * both env vars set, so preview builds and local dev never phone home:
 *
 *   VITE_ANALYTICS_SRC=https://plausible.io/js/script.js
 *   VITE_ANALYTICS_DOMAIN=mcpfold.com
 *
 * See docs/site-hosting.md for the rationale and the no-cookie-wall commitment.
 */
export function initAnalytics(): void {
  const src = import.meta.env.VITE_ANALYTICS_SRC;
  const domain = import.meta.env.VITE_ANALYTICS_DOMAIN;
  if (!src || !domain || typeof document === 'undefined') return;

  const s = document.createElement('script');
  s.defer = true;
  s.src = src;
  s.setAttribute('data-domain', domain);
  document.head.appendChild(s);
}
