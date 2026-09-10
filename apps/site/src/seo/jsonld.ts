import {
  DIRECTORY,
  categoryMeta,
  entriesForCategory,
  pagedCategoriesForEntry,
} from '@mcpfold/core';
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
    // /docs is the sibling static docs build (S8.1), not an SPA route — the build audit knows it is
    // served (seo-audit.mjs EXTERNALLY_SERVED) and still fails on genuinely dead URLs.
    softwareHelp: `${SITE_URL}/docs`,
    license: 'https://opensource.org/licenses/MIT',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  };
}

/** WebApplication node for the free MCP token calculator (/mcp-token-calculator). */
function tokenCalculatorApp(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'MCP token calculator',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Any (runs in the browser)',
    description:
      'Estimate how many tokens your MCP servers spend on tool definitions every turn, and how much per-client curation saves. Free and client-side — nothing is uploaded.',
    url: `${SITE_URL}/mcp-token-calculator`,
    isPartOf: SITE_URL,
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

interface Crumb {
  name: string;
  path: string;
}

function breadcrumb(trail: Crumb[]): JsonLd {
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

/** Human label for each hub, so a derived trail reads the way the nav does. */
const HUB_LABELS: Record<string, string> = {
  '/directory': 'Directory',
  '/guides': 'Guides',
  '/glossary': 'Glossary',
  '/compare': 'Compare',
  '/features': 'Features',
  '/use-cases': 'Use cases',
  '/blog': 'Blog',
  '/install': 'Install',
  '/pricing': 'Pricing',
  '/security': 'Security & trust',
  '/about': 'About',
  '/community': 'Community & support',
  '/brand': 'Brand & press kit',
  '/roadmap': 'Roadmap',
  '/changelog': 'Changelog',
  '/mcp-token-calculator': 'MCP token calculator',
};

const HOME: Crumb = { name: 'Home', path: '/' };

/**
 * The breadcrumb trail for a pathname, derived from the route rather than hand-written per page
 * (SEO-9).
 *
 * Coverage used to be uneven: deep pSEO pages started their trail at the hub with no Home crumb,
 * the hubs themselves emitted no trail at all, /install, /pricing, /security, /changelog and the
 * token calculator emitted none, and a directory entry jumped straight from Directory to the
 * server, skipping the category that actually sits between them. Deriving the trail in one place
 * fixes all of that at once and means a new page type inherits a correct trail for free.
 *
 * Returns [] for the home page, which is its own root and takes no BreadcrumbList.
 */
export function crumbsFor(path: string): Crumb[] {
  const p = path !== '/' && path.endsWith('/') ? path.slice(0, -1) : path;
  if (p === '/') return [];

  if (p.startsWith('/directory/category/')) {
    const cat = p.slice('/directory/category/'.length);
    if (entriesForCategory(cat).length === 0) return [];
    return [HOME, { name: 'Directory', path: '/directory' }, { name: categoryMeta(cat).label, path: p }];
  }
  if (p.startsWith('/directory/')) {
    const entry = DIRECTORY.find((e) => e.id === p.slice('/directory/'.length));
    if (!entry) return [];
    // A server sits under a category, not directly under the directory — reflect the real
    // hierarchy so the SERP path shows where the page actually lives.
    const category = pagedCategoriesForEntry(entry)[0];
    return [
      HOME,
      { name: 'Directory', path: '/directory' },
      ...(category
        ? [{ name: category.label, path: `/directory/category/${category.id}` }]
        : []),
      { name: entry.name, path: p },
    ];
  }

  const deep: Array<[string, (id: string) => string | undefined]> = [
    ['/guides/', (id) => guideById(id)?.label],
    ['/glossary/', (id) => termById(id)?.term],
    ['/compare/', (id) => comparisonById(id)?.navLabel],
    ['/features/', (id) => featureById(id)?.nav],
    ['/use-cases/', (id) => useCaseById(id)?.nav],
    ['/blog/', (id) => POSTS.find((e) => e.slug === id)?.title],
  ];
  for (const [prefix, label] of deep) {
    if (!p.startsWith(prefix)) continue;
    const name = label(p.slice(prefix.length));
    if (!name) return [];
    const hub = prefix.slice(0, -1);
    return [HOME, { name: HUB_LABELS[hub] ?? hub, path: hub }, { name, path: p }];
  }

  const legal = legalDocById(p.slice(1));
  if (legal && legal.path === p) return [HOME, { name: legal.title, path: p }];

  const hubLabel = HUB_LABELS[p];
  return hubLabel ? [HOME, { name: hubLabel, path: p }] : [];
}

/** Page-type structured data for a pathname, without the breadcrumb (added by jsonLdForPath). */
function pageNodes(path: string): JsonLd[] {
  const p = path !== '/' && path.endsWith('/') ? path.slice(0, -1) : path;
  // GEO (S15.2): any page with FAQ units also emits a FAQPage node.
  const faqs = faqsForPath(p);
  const faqNode = faqs.length > 0 ? [faqPageJsonLd(faqs, p)] : [];

  if (p === '/') return [softwareApplication(), ...faqNode];
  if (p === '/mcp-token-calculator') return [tokenCalculatorApp(), ...faqNode];
  if (p === '/directory') return [directoryItemList(), ...faqNode];
  if (p === '/guides') return [guidesItemList(), ...faqNode];
  if (p === '/glossary') return [glossaryTermSet(), ...faqNode];
  if (p === '/compare') return [compareItemList(), ...faqNode];
  if (p === '/features') return [featuresItemList(), ...faqNode];
  if (p === '/use-cases') return [useCasesItemList(), ...faqNode];

  if (p.startsWith('/guides/')) {
    const guide = guideById(p.slice('/guides/'.length));
    if (!guide) return [];
    return [guideHowTo(guide)];
  }

  if (p.startsWith('/glossary/')) {
    const entry = termById(p.slice('/glossary/'.length));
    if (!entry) return [];
    return [definedTerm(entry)];
  }

  if (p.startsWith('/compare/')) {
    const entry = comparisonById(p.slice('/compare/'.length));
    if (!entry) return [];
    return [compareArticle(entry)];
  }

  if (p.startsWith('/features/')) {
    const feature = featureById(p.slice('/features/'.length));
    if (!feature) return [];
    return [featureArticle(feature)];
  }

  // Use-case, directory-entry and blog-post pages carry no page-type schema of their own; they get
  // their FAQs (if any) from the fall-through below and their trail from crumbsFor().
  if (p === '/about') return [aboutOrganization(), ...faqNode];

  // /community, /roadmap and /brand carry no page-type schema of their own — just their FAQs and
  // the derived breadcrumb.
  if (p === '/community' || p === '/roadmap' || p === '/brand') return faqNode;

  if (p.startsWith('/directory/category/')) {
    const cat = p.slice('/directory/category/'.length);
    if (entriesForCategory(cat).length === 0) return [];
    return [categoryItemList(cat)];
  }

  // Legal & policy pages (S13.14) carry only their FAQs; the trail is derived.
  const legal = p.startsWith('/') ? legalDocById(p.slice(1)) : undefined;
  if (legal && legal.path === p) return faqNode;

  // Pages with FAQ units but no other structured data (e.g. /install, /pricing).
  return faqNode;
}

/**
 * Structured-data nodes for a pathname (may be empty).
 *
 * Page-type nodes first, then the derived BreadcrumbList — one trail resolver for the whole site,
 * so coverage can't drift per page type. scripts/seo-audit.mjs asserts every non-home route emits
 * one whose last item is that page's own canonical.
 */
export function jsonLdForPath(path: string): JsonLd[] {
  const crumbs = crumbsFor(path);
  const nodes = pageNodes(path);
  return crumbs.length > 0 ? [...nodes, breadcrumb(crumbs)] : nodes;
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
