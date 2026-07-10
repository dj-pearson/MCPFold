import { DIRECTORY, categoryMeta, entriesForCategory } from '@mcpfold/core';
import { POSTS } from '../blog/posts';
import { SITE_URL } from './meta';
import { faqPageJsonLd, faqsForPath } from './faq';
import { GUIDE_CLIENTS, guideById, type GuideClient } from '../guides/guides.data';
import { guideSteps } from '../guides/steps';
import { GLOSSARY, termById, type GlossaryTerm } from '../glossary/terms';
import { COMPARISONS, comparisonById, type Comparison } from '../compare/comparisons';
import { FEATURES, featureById, type Feature } from '../features/features';
import { USE_CASES, useCaseById } from '../use-cases/use-cases';
import { legalDocById } from '../legal/legal-content';

/**
 * Per-page-type JSON-LD structured data (S15.1). Emitted into the initial HTML by the prerender and
 * kept in sync on the client by <RouteHead>, so answer engines and rich-result crawlers get a
 * schema.org description of each page type (SoftwareApplication, ItemList, DefinedTerm(Set), HowTo,
 * TechArticle, Organization, BreadcrumbList, FAQPage).
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

/** ItemList of every per-client guide (S15.5), for the /guides hub. */
function guidesItemList(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'MCP client setup guides',
    description: 'Guides to add MCP servers to each client mcpfold supports.',
    numberOfItems: GUIDE_CLIENTS.length,
    itemListElement: GUIDE_CLIENTS.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: `Add MCP servers to ${c.label}`,
      url: `${SITE_URL}/guides/${c.id}`,
    })),
  };
}

/** DefinedTermSet for the /glossary hub (S15.6) — the set of concept pages. */
function glossaryTermSet(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    '@id': `${SITE_URL}/glossary`,
    name: 'MCP glossary',
    description: 'Definitions of core Model Context Protocol concepts.',
    hasDefinedTerm: GLOSSARY.map((t) => ({
      '@type': 'DefinedTerm',
      name: t.term,
      description: t.short,
      url: `${SITE_URL}/glossary/${t.id}`,
    })),
  };
}

/** ItemList of the comparison pages (S15.7), for the /compare hub. */
function compareItemList(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'mcpfold comparisons',
    description: 'Factual comparisons of ways to manage MCP servers across clients.',
    numberOfItems: COMPARISONS.length,
    itemListElement: COMPARISONS.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.h1,
      url: `${SITE_URL}/compare/${c.id}`,
    })),
  };
}

/** ItemList of the four feature pillars (S13.10), for the /features index. */
function featuresItemList(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'mcpfold features',
    description: 'The four capabilities mcpfold provides.',
    numberOfItems: FEATURES.length,
    itemListElement: FEATURES.map((f, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: f.h1,
      url: `${SITE_URL}/features/${f.id}`,
    })),
  };
}

/** ItemList of the persona pages (S13.11), for the /use-cases index. */
function useCasesItemList(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'mcpfold use cases',
    description: 'The same product framed around each visitor’s situation.',
    numberOfItems: USE_CASES.length,
    itemListElement: USE_CASES.map((u, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: u.h1,
      url: `${SITE_URL}/use-cases/${u.id}`,
    })),
  };
}

/** HowTo structured data for a client guide — mirrors the visible steps (single source: steps.ts). */
function guideHowTo(client: GuideClient): JsonLd {
  const url = `${SITE_URL}/guides/${client.id}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: `Add MCP servers to ${client.label}`,
    description: `Set up MCP servers in ${client.label} with mcpfold — one canonical config folded into ${client.label}'s own format.`,
    step: guideSteps(client).map((s, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: s.name,
      text: s.text,
      url,
    })),
  };
}

/** DefinedTerm structured data for a single concept page (S15.6). */
function definedTerm(term: GlossaryTerm): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'DefinedTerm',
    name: term.term,
    description: term.short,
    url: `${SITE_URL}/glossary/${term.id}`,
    inDefinedTermSet: `${SITE_URL}/glossary`,
  };
}

/** TechArticle structured data for a comparison page (S15.7) — the appropriate editorial schema. */
function compareArticle(entry: Comparison): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: entry.h1,
    description: entry.intro,
    about: 'Managing Model Context Protocol (MCP) server configuration',
    url: `${SITE_URL}/compare/${entry.id}`,
    isPartOf: `${SITE_URL}/compare`,
  };
}

/** TechArticle structured data for a feature deep-dive page (S13.10). */
function featureArticle(feature: Feature): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: feature.h1,
    description: feature.tagline,
    about: 'mcpfold — MCP configuration management',
    url: `${SITE_URL}/features/${feature.id}`,
    isPartOf: `${SITE_URL}/features`,
  };
}

/** Organization node for the About page (S13.12) — the project behind mcpfold. */
function aboutOrganization(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'mcpfold',
    url: SITE_URL,
    description:
      'An independent, open-source project: one source of truth for your MCP servers, folded out to every client.',
    sameAs: ['https://github.com/dj-pearson/MCPFold', 'https://www.npmjs.com/package/mcpfold'],
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
  if (p === '/guides') return [guidesItemList(), ...faqNode];
  if (p === '/glossary') return [glossaryTermSet(), ...faqNode];
  if (p === '/compare') return [compareItemList(), ...faqNode];
  if (p === '/features') return [featuresItemList(), ...faqNode];
  if (p === '/use-cases') return [useCasesItemList(), ...faqNode];

  if (p.startsWith('/guides/')) {
    const guide = guideById(p.slice('/guides/'.length));
    if (!guide) return [];
    return [
      guideHowTo(guide),
      breadcrumb([
        { name: 'Guides', path: '/guides' },
        { name: guide.label, path: `/guides/${guide.id}` },
      ]),
    ];
  }

  if (p.startsWith('/glossary/')) {
    const entry = termById(p.slice('/glossary/'.length));
    if (!entry) return [];
    return [
      definedTerm(entry),
      breadcrumb([
        { name: 'Glossary', path: '/glossary' },
        { name: entry.term, path: `/glossary/${entry.id}` },
      ]),
    ];
  }

  if (p.startsWith('/compare/')) {
    const entry = comparisonById(p.slice('/compare/'.length));
    if (!entry) return [];
    return [
      compareArticle(entry),
      breadcrumb([
        { name: 'Compare', path: '/compare' },
        { name: entry.navLabel, path: `/compare/${entry.id}` },
      ]),
    ];
  }

  if (p.startsWith('/features/')) {
    const feature = featureById(p.slice('/features/'.length));
    if (!feature) return [];
    return [
      featureArticle(feature),
      breadcrumb([
        { name: 'Features', path: '/features' },
        { name: feature.nav, path: `/features/${feature.id}` },
      ]),
    ];
  }

  if (p.startsWith('/use-cases/')) {
    const uc = useCaseById(p.slice('/use-cases/'.length));
    if (!uc) return [];
    return [
      breadcrumb([
        { name: 'Use cases', path: '/use-cases' },
        { name: uc.nav, path: `/use-cases/${uc.id}` },
      ]),
    ];
  }

  if (p === '/about')
    return [
      aboutOrganization(),
      breadcrumb([
        { name: 'Home', path: '/' },
        { name: 'About', path: '/about' },
      ]),
      ...faqNode,
    ];

  if (p === '/community')
    return [
      breadcrumb([
        { name: 'Home', path: '/' },
        { name: 'Community & support', path: '/community' },
      ]),
      ...faqNode,
    ];

  if (p === '/roadmap')
    return [
      breadcrumb([
        { name: 'Home', path: '/' },
        { name: 'Roadmap', path: '/roadmap' },
      ]),
      ...faqNode,
    ];

  if (p === '/brand')
    return [
      breadcrumb([
        { name: 'Home', path: '/' },
        { name: 'Brand & press kit', path: '/brand' },
      ]),
      ...faqNode,
    ];

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

  // Legal & policy pages (S13.14): a breadcrumb into each policy.
  const legal = p.startsWith('/') ? legalDocById(p.slice(1)) : undefined;
  if (legal && legal.path === p) {
    return [
      breadcrumb([
        { name: 'Home', path: '/' },
        { name: legal.title, path: legal.path },
      ]),
      ...faqNode,
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
