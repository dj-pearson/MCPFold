import {
  DIRECTORY,
  categoriesWithPages,
  categoryMeta,
  entriesForCategory,
  pagedCategoriesForEntry,
} from '@mcpfold/core';
import { GUIDE_CLIENTS, guideById } from '../guides/guides.data';
import { GLOSSARY, termById } from '../glossary/terms';
import { COMPARISONS, comparisonById } from '../compare/comparisons';
import { FEATURES, featureById } from '../features/features';
import { USE_CASES, useCaseById } from '../use-cases/use-cases';

/**
 * Cross-silo related links (SEO-7).
 *
 * Every deep page type on this site linked only within its own silo: a directory entry linked back
 * to /directory and to its category tags and nothing else, glossary terms linked to glossary terms,
 * comparisons to comparisons. With ~90 directory entries plus guides, terms and comparisons, that
 * left the deepest and most numerous pages with almost no inbound internal links and no topical
 * path between silos — the single biggest structural lever on a generated site.
 *
 * This resolver derives a small set of links that deliberately cross silos (a directory entry
 * points at the guide for installing it, the glossary term that explains what it is, and the token
 * calculator; a guide points at the directory and the feature it demonstrates). Everything comes
 * from existing data — nothing is hand-curated per page, so new entries mesh in automatically.
 *
 * <RelatedLinks/> renders this once in Layout, so no page type can forget it, and the build's
 * orphan guard (SEO-8) checks the resulting graph.
 */

export interface RelatedLink {
  href: string;
  label: string;
  /** One short line of context, so the block reads as navigation rather than a link farm. */
  blurb: string;
}

/** Cap the block so it stays a navigation aid rather than a link dump. */
const MAX_LINKS = 6;

/** Rotate a list deterministically by a string key, so siblings differ page to page. */
function rotate<T>(items: readonly T[], key: string): T[] {
  if (items.length === 0) return [];
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  const at = hash % items.length;
  return [...items.slice(at), ...items.slice(0, at)];
}

/** The glossary term that best explains a page's subject, by id convention. */
function termLink(id: string): RelatedLink | undefined {
  const term = termById(id);
  if (!term) return undefined;
  return { href: `/glossary/${term.id}`, label: term.term, blurb: 'What this means, in one page.' };
}

function featureLink(id: string, blurb: string): RelatedLink | undefined {
  const feature = featureById(id);
  if (!feature) return undefined;
  return { href: `/features/${feature.id}`, label: feature.nav, blurb };
}

function compareLink(id: string, blurb: string): RelatedLink | undefined {
  const entry = comparisonById(id);
  if (!entry) return undefined;
  return { href: `/compare/${entry.id}`, label: entry.navLabel, blurb };
}

function useCaseLink(id: string, blurb: string): RelatedLink | undefined {
  const uc = useCaseById(id);
  if (!uc) return undefined;
  return { href: `/use-cases/${uc.id}`, label: uc.nav, blurb };
}

function guideLink(client: { id: string; label: string }): RelatedLink {
  return {
    href: `/guides/${client.id}`,
    label: `Add MCP servers to ${client.label}`,
    blurb: `Config path, format, and secrets for ${client.label}.`,
  };
}

const TOKEN_CALCULATOR: RelatedLink = {
  href: '/mcp-token-calculator',
  label: 'MCP token calculator',
  blurb: 'Estimate what your servers cost you every turn.',
};

const DIRECTORY_LINK: RelatedLink = {
  href: '/directory',
  label: 'MCP server directory',
  blurb: `Browse ${DIRECTORY.length}+ servers by category.`,
};

/** Drop undefined entries, de-duplicate by href, exclude the current page, and cap. */
function assemble(path: string, links: Array<RelatedLink | undefined>): RelatedLink[] {
  const seen = new Set<string>([path]);
  const out: RelatedLink[] = [];
  for (const link of links) {
    if (!link || seen.has(link.href)) continue;
    seen.add(link.href);
    out.push(link);
    if (out.length === MAX_LINKS) break;
  }
  return out;
}

/**
 * Related links for a pathname. Returns [] for pages that shouldn't carry the block (the home page,
 * hubs that are already link indexes, and transactional/legal pages).
 */
export function relatedFor(path: string): RelatedLink[] {
  const p = path !== '/' && path.endsWith('/') ? path.slice(0, -1) : path;

  // --- Directory entry: the deepest, most numerous, most link-starved page type ----------------
  if (p.startsWith('/directory/category/')) {
    const cat = p.slice('/directory/category/'.length);
    if (entriesForCategory(cat).length === 0) return [];
    const siblings = rotate(
      categoriesWithPages().filter((c) => c.id !== cat),
      cat,
    );
    return assemble(p, [
      ...siblings.slice(0, 3).map((c) => ({
        href: `/directory/category/${c.id}`,
        label: `${c.label} MCP servers`,
        blurb: `${entriesForCategory(c.id).length} servers in this category.`,
      })),
      featureLink('tool-curation', 'Load only the tools you use from each server.'),
      TOKEN_CALCULATOR,
      DIRECTORY_LINK,
    ]);
  }

  if (p.startsWith('/directory/')) {
    const entry = DIRECTORY.find((e) => e.id === p.slice('/directory/'.length));
    if (!entry) return [];
    const cats = pagedCategoriesForEntry(entry);
    const siblings = rotate(
      cats.flatMap((c) => entriesForCategory(c.id)).filter((e) => e.id !== entry.id),
      entry.id,
    );
    return assemble(p, [
      ...cats.slice(0, 1).map((c) => ({
        href: `/directory/category/${c.id}`,
        label: `Best ${categoryMeta(c.id).label} MCP servers`,
        blurb: 'The whole category, side by side.',
      })),
      ...siblings.slice(0, 2).map((e) => ({
        href: `/directory/${e.id}`,
        label: e.name,
        blurb: 'Another server in the same category.',
      })),
      // Cross-silo: how you actually install it, and what it is.
      guideLink(rotate(GUIDE_CLIENTS, entry.id)[0]!),
      termLink('mcp-server'),
      TOKEN_CALCULATOR,
    ]);
  }

  // --- Guides: the install path. Point at what to install and why it stays in one config -------
  if (p.startsWith('/guides/')) {
    const guide = guideById(p.slice('/guides/'.length));
    if (!guide) return [];
    const others = rotate(
      GUIDE_CLIENTS.filter((c) => c.id !== guide.id),
      guide.id,
    );
    return assemble(p, [
      DIRECTORY_LINK,
      ...others.slice(0, 2).map(guideLink),
      featureLink('one-config', 'Why one config folds out to every client.'),
      featureLink('secrets', 'Keep credentials as references, never values.'),
      compareLink('manual-vs-mcpfold', 'What this replaces if you edit configs by hand.'),
    ]);
  }

  // --- Glossary: definitions should feed the pages that put the concept to work ----------------
  if (p.startsWith('/glossary/')) {
    const term = termById(p.slice('/glossary/'.length));
    if (!term) return [];
    const others = rotate(
      GLOSSARY.filter((t) => t.id !== term.id),
      term.id,
    );
    return assemble(p, [
      ...others.slice(0, 2).map((t) => ({
        href: `/glossary/${t.id}`,
        label: t.term,
        blurb: 'A related concept.',
      })),
      // The concept in practice, chosen per term rather than generically.
      term.id === 'context-window' || term.id === 'mcp-tools'
        ? featureLink('tool-curation', 'Cut the tokens this costs you.')
        : term.id === 'secret-reference'
          ? featureLink('secrets', 'How mcpfold stores credentials.')
          : featureLink('one-config', 'One config, folded out to every client.'),
      term.id === 'context-window' || term.id === 'mcp-tools' ? TOKEN_CALCULATOR : DIRECTORY_LINK,
      compareLink('mcp-config-manager', 'Where mcpfold fits among the alternatives.'),
    ]);
  }

  // --- Comparisons: commercial intent. Send readers to proof and to the install path -----------
  if (p.startsWith('/compare/')) {
    const entry = comparisonById(p.slice('/compare/'.length));
    if (!entry) return [];
    const others = rotate(
      COMPARISONS.filter((c) => c.id !== entry.id),
      entry.id,
    );
    return assemble(p, [
      ...others.slice(0, 2).map((c) => ({
        href: `/compare/${c.id}`,
        label: c.navLabel,
        blurb: 'Another comparison.',
      })),
      featureLink('tool-curation', 'The mechanism behind the token savings.'),
      TOKEN_CALCULATOR,
      useCaseLink('teams', 'What this looks like for a team.'),
      { href: '/install', label: 'Install mcpfold', blurb: 'One copy-paste, any platform.' },
    ]);
  }

  // --- Features: explain the mechanism, then who it's for and what it beats --------------------
  if (p.startsWith('/features/')) {
    const feature = featureById(p.slice('/features/'.length));
    if (!feature) return [];
    const others = rotate(
      FEATURES.filter((f) => f.id !== feature.id),
      feature.id,
    );
    return assemble(p, [
      ...others.slice(0, 2).map((f) => ({
        href: `/features/${f.id}`,
        label: f.nav,
        blurb: 'Another pillar.',
      })),
      feature.id === 'tool-curation' ? TOKEN_CALCULATOR : DIRECTORY_LINK,
      useCaseLink('solo', 'The same capability, framed by situation.'),
      compareLink('manual-vs-mcpfold', 'How this compares to doing it by hand.'),
    ]);
  }

  // --- Use cases: persona pages should route into the mechanism and the install path -----------
  if (p.startsWith('/use-cases/')) {
    const uc = useCaseById(p.slice('/use-cases/'.length));
    if (!uc) return [];
    const others = rotate(
      USE_CASES.filter((u) => u.id !== uc.id),
      uc.id,
    );
    return assemble(p, [
      ...others.slice(0, 2).map((u) => ({
        href: `/use-cases/${u.id}`,
        label: u.nav,
        blurb: 'Another situation.',
      })),
      featureLink('one-config', 'The capability underneath.'),
      guideLink(rotate(GUIDE_CLIENTS, uc.id)[0]!),
      DIRECTORY_LINK,
    ]);
  }

  // --- Blog posts: editorial content should route into the evergreen pages ---------------------
  if (p.startsWith('/blog/')) {
    return assemble(p, [
      featureLink('tool-curation', 'Cut what your servers cost per turn.'),
      TOKEN_CALCULATOR,
      compareLink('reduce-mcp-token-usage', 'Every approach to the token problem, compared.'),
      DIRECTORY_LINK,
      { href: '/install', label: 'Install mcpfold', blurb: 'One copy-paste, any platform.' },
    ]);
  }

  // Hubs are already link indexes; the home, install, pricing and legal pages have their own CTAs.
  return [];
}
