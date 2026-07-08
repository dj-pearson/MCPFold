import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { resolveMeta } from './meta';
import { jsonLdForPath } from './jsonld';

/**
 * Runtime head sync (S13.1 + S15.1). A single <RouteHead/> mounted in Layout keeps <title>,
 * description, canonical, Open Graph/Twitter tags, and JSON-LD in sync as the SPA navigates.
 *
 * The values come from resolveMeta()/jsonLdForPath() — the SAME functions the build-time prerender
 * uses — so there is exactly one source of truth: no divergence between the crawlable initial HTML
 * and the hydrated app (S15.1 acceptance). Prerendered tags are simply reconciled to the current
 * route on navigation; the first (hydrating) route already matches, so nothing flashes.
 */
export { SITE_URL } from './meta';

function setMeta(attr: 'name' | 'property', key: string, value: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

function setCanonical(href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/** Replace the JSON-LD blocks the prerender emitted with the ones for the current route. */
function setJsonLd(path: string): void {
  document.head
    .querySelectorAll('script[type="application/ld+json"][data-route-head]')
    .forEach((el) => el.remove());
  for (const node of jsonLdForPath(path)) {
    const el = document.createElement('script');
    el.setAttribute('type', 'application/ld+json');
    el.setAttribute('data-route-head', '');
    el.textContent = JSON.stringify(node);
    document.head.appendChild(el);
  }
}

export function RouteHead() {
  const { pathname } = useLocation();
  useEffect(() => {
    const { title, description, canonical } = resolveMeta(pathname);
    document.title = title;
    setMeta('name', 'description', description);
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:url', canonical);
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', description);
    setCanonical(canonical);
    setJsonLd(pathname);
  }, [pathname]);
  return null;
}
