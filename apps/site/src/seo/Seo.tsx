import { useEffect } from 'react';

/**
 * Per-route SEO (S13.1). Keeps <title>, description, canonical, and Open Graph/Twitter tags in
 * sync as the SPA navigates. The static index.html carries the homepage baseline so crawlers and
 * link-unfurlers that don't run JS still get correct tags for the root; SSG/prerender (later) can
 * extend this to every route.
 */
export const SITE_URL = 'https://mcpfold.com';

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

export interface SeoProps {
  title: string;
  description: string;
  path: string;
}

export function Seo({ title, description, path }: SeoProps) {
  useEffect(() => {
    const url = `${SITE_URL}${path}`;
    document.title = title;
    setMeta('name', 'description', description);
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:url', url);
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', description);
    setCanonical(url);
  }, [title, description, path]);
  return null;
}
