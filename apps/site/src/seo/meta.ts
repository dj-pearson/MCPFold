import { DIRECTORY, categoriesWithPages, categoryMeta, entriesForCategory } from '@mcpfold/core';
import { POSTS } from '../blog/posts';
import { GUIDE_CLIENTS, guideById } from '../guides/guides.data';
import { GLOSSARY, termById } from '../glossary/terms';
import { COMPARISONS, comparisonById } from '../compare/comparisons';
import { FEATURES, featureById } from '../features/features';
import { USE_CASES, useCaseById } from '../use-cases/use-cases';
import { LEGAL_DOCS, legalDocById } from '../legal/legal-content';

/**
 * Single source of truth for per-route <title>/description/canonical (S15.1).
 *
 * Both the runtime <RouteHead> (SPA navigation) and the build-time prerender (scripts/prerender.mjs)
 * resolve meta through this one function, so there is no divergence between what a crawler sees in
 * the initial HTML and what the hydrated app renders. `path` is a pathname without query/hash.
 */
export const SITE_URL = 'https://mcpfold.com';

export interface RouteMeta {
  title: string;
  description: string;
  /** Absolute canonical URL. */
  canonical: string;
}

// S15.3: lead with the focus keyword cluster (MCP config / manage MCP servers / every MCP client),
// name the clients, and keep the token-savings proof — within ~160 chars.
const HOME_DESC =
  'Manage MCP servers from one config, folded out to every MCP client — Claude Code, Cursor, VS Code, Windsurf, Zed. Secret references, not hardcoded values.';

function meta(title: string, description: string, path: string): RouteMeta {
  return { title, description, canonical: `${SITE_URL}${path}` };
}

/** Resolve the canonical <title>/description/canonical for a pathname. Never throws. */
export function resolveMeta(path: string): RouteMeta {
  // Normalize a trailing slash (except the root) so "/install/" and "/install" agree.
  const p = path !== '/' && path.endsWith('/') ? path.slice(0, -1) : path;

  if (p === '/') {
    return meta('mcpfold — one MCP config for every MCP client', HOME_DESC, '/');
  }
  if (p === '/install') {
    return meta(
      'Install mcpfold — every channel, one copy-paste',
      'Install mcpfold via npx, npm, Homebrew, curl | sh, Scoop, winget, or a standalone binary — then init, import, and sync.',
      '/install',
    );
  }
  if (p === '/directory') {
    return meta(
      'Best MCP servers — the curated directory · mcpfold',
      `Browse ${DIRECTORY.length}+ MCP servers by category — files, databases, browsers, search, and more — and add any to your config in one command. A neutral, community-maintained list.`,
      '/directory',
    );
  }
  if (p.startsWith('/directory/category/')) {
    const cat = p.slice('/directory/category/'.length);
    if (entriesForCategory(cat).length > 0) {
      const m = categoryMeta(cat);
      return meta(
        `Best ${m.label} MCP servers · mcpfold`,
        `${m.description} Browse ${entriesForCategory(cat).length} and add any to your config in one command.`,
        `/directory/category/${cat}`,
      );
    }
    return meta('Category not found — mcpfold directory', 'No such category.', p);
  }
  if (p.startsWith('/directory/')) {
    const id = p.slice('/directory/'.length);
    const entry = DIRECTORY.find((e) => e.id === id);
    if (entry) {
      return meta(
        `${entry.name} — MCP server · mcpfold`,
        entry.description,
        `/directory/${entry.id}`,
      );
    }
    return meta('Server not found — mcpfold directory', 'No such server.', p);
  }
  if (p === '/guides') {
    return meta(
      'MCP setup guides — add MCP servers to any client · mcpfold',
      `Copy-paste guides to add MCP servers to ${GUIDE_CLIENTS.length} clients — Claude Code, Cursor, VS Code, Windsurf, and more — with one mcpfold config folded out to each.`,
      '/guides',
    );
  }
  if (p.startsWith('/guides/')) {
    const guide = guideById(p.slice('/guides/'.length));
    if (guide) {
      return meta(
        `Add MCP servers to ${guide.label} · mcpfold`,
        `Set up MCP servers in ${guide.label} with mcpfold: one canonical config folded into ${guide.label}'s own format, secrets kept as references. Config paths straight from the adapter.`,
        `/guides/${guide.id}`,
      );
    }
    return meta('Guide not found — mcpfold', 'No such client guide.', p);
  }
  if (p === '/glossary') {
    return meta(
      'MCP glossary — Model Context Protocol concepts explained · mcpfold',
      'Clear, neutral definitions of MCP concepts — MCP server, Model Context Protocol, MCP client, MCP tools, context window, secret reference, and MCP config manager.',
      '/glossary',
    );
  }
  if (p.startsWith('/glossary/')) {
    const entry = termById(p.slice('/glossary/'.length));
    if (entry) {
      return meta(`${entry.heading} · mcpfold glossary`, entry.short, `/glossary/${entry.id}`);
    }
    return meta('Term not found — mcpfold glossary', 'No such glossary entry.', p);
  }
  if (p === '/compare') {
    return meta(
      'How mcpfold compares — MCP config, by hand vs gateway vs mcpfold',
      'Honest, factual comparisons of ways to manage MCP servers across clients — by hand, with a hosted gateway, or with mcpfold, a local-first open-source CLI. Clear about what mcpfold is not.',
      '/compare',
    );
  }
  if (p.startsWith('/compare/')) {
    const entry = comparisonById(p.slice('/compare/'.length));
    if (entry) {
      return meta(`${entry.metaTitle} · mcpfold`, entry.intro, `/compare/${entry.id}`);
    }
    return meta('Comparison not found — mcpfold', 'No such comparison.', p);
  }
  if (p === '/features') {
    return meta(
      'Features — what mcpfold does · one config, curation, secrets, drift',
      'Go deep on each mcpfold pillar: one config folded to every client, per-server tool curation to cut context tokens, secrets as references, and sync/diff/drift control.',
      '/features',
    );
  }
  if (p.startsWith('/features/')) {
    const feature = featureById(p.slice('/features/'.length));
    if (feature) {
      return meta(`${feature.metaTitle}`, feature.tagline, `/features/${feature.id}`);
    }
    return meta('Feature not found — mcpfold', 'No such feature.', p);
  }
  if (p === '/use-cases') {
    return meta(
      'Who mcpfold is for — solo developers, teams, power users',
      'The same product framed around your situation: one MCP config across your own clients, a repo-committed setup for teams with a CI drift gate, or tool curation to cut the context tax.',
      '/use-cases',
    );
  }
  if (p.startsWith('/use-cases/')) {
    const uc = useCaseById(p.slice('/use-cases/'.length));
    if (uc) {
      return meta(`${uc.metaTitle}`, uc.tagline, `/use-cases/${uc.id}`);
    }
    return meta('Use case not found — mcpfold', 'No such use case.', p);
  }
  if (p === '/pricing') {
    return meta(
      'Pricing — mcpfold',
      'The CLI and everything local is free forever and MIT-licensed. The hosted team cloud — shared configs, audit trail, sync — is the paid surface. Self-host it yourself for free.',
      '/pricing',
    );
  }
  if (p === '/security') {
    return meta(
      'Security & trust — mcpfold',
      'How mcpfold handles secrets (references, never values), stays local-first, redacts diagnostics, keeps telemetry off by default, and how to report a vulnerability privately.',
      '/security',
    );
  }
  if (p === '/about') {
    return meta(
      'About mcpfold — the open-source MCP config manager',
      'mcpfold’s mission and open-source model: one neutral mcp.config.jsonc format for every client, MIT-licensed CLI, an optional self-hostable cloud, and how to contribute an adapter.',
      '/about',
    );
  }
  {
    const legal = p.startsWith('/') ? legalDocById(p.slice(1)) : undefined;
    if (legal && legal.path === p) {
      return meta(legal.metaTitle, legal.metaDescription, legal.path);
    }
  }
  if (p === '/community') {
    return meta(
      'Community & support — mcpfold',
      'Get help in GitHub Discussions, report a bug with the redaction-safe `mcpfold diagnose` bundle, request or contribute a client adapter, and find the contributing guide.',
      '/community',
    );
  }
  if (p === '/blog') {
    return meta(
      'Blog — mcpfold',
      'Launches, deep-dives, and release notes from the mcpfold project.',
      '/blog',
    );
  }
  if (p.startsWith('/blog/')) {
    const slug = p.slice('/blog/'.length);
    const post = POSTS.find((e) => e.slug === slug);
    if (post) {
      return meta(`${post.title} — mcpfold`, post.description, `/blog/${post.slug}`);
    }
    return meta('Post not found — mcpfold', 'No such post.', p);
  }
  if (p === '/changelog') {
    return meta(
      'Changelog — mcpfold',
      'Human-readable release notes for mcpfold, derived from the CHANGELOG source.',
      '/changelog',
    );
  }
  if (p === '/roadmap') {
    return meta(
      'Roadmap — mcpfold',
      'Where mcpfold is headed: what has shipped, what is next, and what we are exploring — rendered from the project’s single roadmap source. Nothing here is a dated commitment.',
      '/roadmap',
    );
  }

  if (p === '/brand') {
    return meta(
      'Brand & press kit — mcpfold',
      'Logo and wordmark downloads, color tokens, the product one-liner, and usage guidelines for representing mcpfold — an independent, open-source project.',
      '/brand',
    );
  }
  if (p === '/404') {
    return meta(
      'Page not found — mcpfold',
      'This page doesn’t exist. Here’s the way back.',
      '/404',
    );
  }

  // Unknown route: keep a sane, non-empty default rather than an empty <title>.
  return meta('mcpfold', HOME_DESC, p);
}

/** Every concrete pathname the site prerenders — static routes plus data-derived pages. */
export function allRoutes(): string[] {
  return [
    '/',
    '/install',
    '/directory',
    '/pricing',
    '/security',
    '/about',
    '/community',
    '/brand',
    '/blog',
    '/changelog',
    '/guides',
    '/features',
    ...FEATURES.map((f) => `/features/${f.id}`),
    '/use-cases',
    ...USE_CASES.map((u) => `/use-cases/${u.id}`),
    ...LEGAL_DOCS.map((d) => d.path),
    '/roadmap',
    '/glossary',
    '/compare',
    ...categoriesWithPages().map((c) => `/directory/category/${c.id}`),
    ...DIRECTORY.map((e) => `/directory/${e.id}`),
    ...GUIDE_CLIENTS.map((c) => `/guides/${c.id}`),
    ...GLOSSARY.map((t) => `/glossary/${t.id}`),
    ...COMPARISONS.map((c) => `/compare/${c.id}`),
    ...POSTS.map((p) => `/blog/${p.slug}`),
  ];
}
