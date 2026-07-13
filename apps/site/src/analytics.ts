/**
 * Privacy-friendly analytics (S13.1). Cookieless, no PII, no cross-site tracking — designed for a
 * Plausible/Umami-style endpoint. It is OFF by default and only loads when the site is built with
 * both env vars set, so preview builds and local dev never phone home:
 *
 *   VITE_ANALYTICS_SRC=https://plausible.io/js/script.js
 *   VITE_ANALYTICS_DOMAIN=mcpfold.com
 *
 * See docs/site-hosting.md for the rationale and the no-cookie-wall commitment.
 *
 * S21.5 — WEB-FUNNEL ONLY. The custom-event helpers below measure the marketing funnel (landing →
 * install-command copy → outbound to npm/GitHub, plus calculator engagement) so channel-to-install
 * conversion is knowable. They are the SAME cookieless, PII-free sink — no identifiers, only coarse
 * event names + a first-touch channel `ref`. This is entirely separate from the CLI: mcpfold the tool
 * ships no telemetry of its own by default (see docs/telemetry.md); nothing here runs in the CLI.
 */

/** Plausible's custom-event API — present only once the analytics script has loaded (prod only). */
declare global {
  interface Window {
    plausible?: (
      event: string,
      options?: { props?: Record<string, string | number | boolean> },
    ) => void;
  }
}

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

const REF_KEY = 'mcpfold_ref';

/**
 * The first-touch growth channel: `utm_source` or `ref` from the landing URL, persisted for the
 * session so every downstream funnel event stays attributed to the channel that drove the visit.
 * Cookieless (sessionStorage), no identifier — just the channel tag from the link.
 */
export function channelRef(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const params = new URLSearchParams(window.location.search);
    const fresh = params.get('utm_source') ?? params.get('ref') ?? undefined;
    if (fresh) {
      sessionStorage.setItem(REF_KEY, fresh);
      return fresh;
    }
    return sessionStorage.getItem(REF_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Fire a privacy-friendly custom funnel event. A safe no-op until the analytics script loads (so dev
 * and preview builds never phone home), it attaches the first-touch `ref` so the funnel can be
 * segmented by channel. Never pass PII — only coarse, non-identifying props.
 */
export function track(event: string, props: Record<string, string | number | boolean> = {}): void {
  if (typeof window === 'undefined' || typeof window.plausible !== 'function') return;
  const ref = channelRef();
  window.plausible(event, { props: ref ? { ...props, ref } : props });
}

/**
 * Track outbound clicks to npm/GitHub (and any off-site link) with ONE delegated listener, so the
 * funnel's exit points are measured without instrumenting every link. Fires `Outbound link` with the
 * destination host. Idempotent — safe to call once at startup.
 */
export function trackOutboundClicks(): void {
  if (typeof document === 'undefined') return;
  document.addEventListener('click', (e) => {
    const anchor = (e.target as Element | null)?.closest?.('a');
    const href = anchor?.getAttribute('href');
    if (!href || !/^https?:\/\//i.test(href)) return; // internal/relative links aren't outbound
    try {
      const url = new URL(href);
      if (url.host === window.location.host) return; // same-site
      track('Outbound link', { host: url.host, url: href });
    } catch {
      // malformed href — ignore
    }
  });
}
