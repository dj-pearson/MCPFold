import { DIRECTORY, categoryMeta, entriesForCategory } from '@mcpfold/core';
import { POSTS } from '../blog/posts';
import { SITE_URL } from './meta';
import { faqPageJsonLd, faqsForPath } from './faq';

/**
 * Per-page-type JSON-LD structured data (S15.1). Emitted into the initial HTML by the prerender and
 * kept in sync on the client by <RouteHead>, so answer engines and rich-result crawlers get a
 * schema.org description of each page type:
 *   - SoftwareApplication on the homepage
 *   - ItemList on /directory
 *   - BreadcrumbList on directory + blog entry pages
 */

/** A JSON-LD node. `@type` is always present; the rest is schema.org vocabulary. */
export type JsonLd = Record<string, unknown> & { '@type': string };

function softwareApplication(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'mcpfold',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'macOS, Windows, Linux',
    description:
      'One source of truth for your MCP servers. Write it once, fold it out to every client — secrets never hardcoded, only the tools you need loaded.',
    url: SITE_URL,
    downloadUrl: `${SITE_URL}/install`,
    softwareHelp: `${SITE_URL}/docs`,
    license: 'https://opensource.org/licenses/MIT',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  };
}

function directoryItemList(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'MCP server directory',
    description: 'A curated, community-maintained directory of MCP servers.',
    numberOfItems: DIRECTORY.length,
    itemListElement: DIRECTORY.map((entry, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: entry.name,
      url: `${SITE_URL}/directory/${entry.id}`,
    })),
  };
}

/** ItemList for a category/collection page (S15.4) — its servers, in directory order. */
function categoryItemList(cat: string): JsonLd {
  const m = categoryMeta(cat);
  const entries = entriesForCategory(cat);
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${m.label} MCP servers`,
    description: m.description,
    numberOfItems: entries.length,
    itemListElement: entries.map((entry, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: entry.name,
      url: `${SITE_URL}/directory/${entry.id}`,
    })),
  };
}

function breadcrumb(trail: Array<{ name: string; path: string }>): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      item: `${SITE_URL}${crumb.path}`,
    })),
  };
}

/** Structured-data nodes for a pathname (may be empty). */
export function jsonLdForPath(path: string): JsonLd[] {
  const p = path !== '/' && path.endsWith('/') ? path.slice(0, -1) : path;
  // GEO (S15.2): any page with FAQ units also emits a FAQPage node.
  const faqs = faqsForPath(p);
  const faqNode = faqs.length > 0 ? [faqPageJsonLd(faqs, p)] : [];

  if (p === '/') return [softwareApplication(), ...faqNode];
  if (p === '/directory') return [directoryItemList(), ...faqNode];

  if (p.startsWith('/directory/category/')) {
    const cat = p.slice('/directory/category/'.length);
    if (entriesForCategory(cat).length === 0) return [];
    return [
      categoryItemList(cat),
      breadcrumb([
        { name: 'Directory', path: '/directory' },
        { name: categoryMeta(cat).label, path: `/directory/category/${cat}` },
      ]),
    ];
  }

  if (p.startsWith('/directory/')) {
    const entry = DIRECTORY.find((e) => e.id === p.slice('/directory/'.length));
    if (!entry) return [];
    return [
      breadcrumb([
        { name: 'Directory', path: '/directory' },
        { name: entry.name, path: `/directory/${entry.id}` },
      ]),
    ];
  }

  if (p.startsWith('/blog/')) {
    const post = POSTS.find((e) => e.slug === p.slice('/blog/'.length));
    if (!post) return [];
    return [
      breadcrumb([
        { name: 'Blog', path: '/blog' },
        { name: post.title, path: `/blog/${post.slug}` },
      ]),
    ];
  }

  // Pages with FAQ units but no other structured data (e.g. /install, /pricing).
  return faqNode;
}

/** Serialize the JSON-LD nodes for a path into <script type="application/ld+json"> tags (SSG use). */
export function jsonLdScriptTags(path: string): string {
  return jsonLdForPath(path)
    .map(
      (node) =>
        `<script type="application/ld+json">${JSON.stringify(node).replace(/</g, '\\u003c')}</script>`,
    )
    .join('');
}
