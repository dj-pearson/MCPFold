import { DIRECTORY } from '@mcpfold/core';
import { POSTS } from '../blog/posts';
import { SITE_URL } from './meta';

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

  if (p === '/') return [softwareApplication()];
  if (p === '/directory') return [directoryItemList()];

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

  return [];
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
