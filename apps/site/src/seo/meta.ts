import { DIRECTORY, categoriesWithPages, categoryMeta, entriesForCategory } from '@mcpfold/core';
import { POSTS } from '../blog/posts';

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
    '/blog',
    '/changelog',
    ...categoriesWithPages().map((c) => `/directory/category/${c.id}`),
    ...DIRECTORY.map((e) => `/directory/${e.id}`),
    ...POSTS.map((p) => `/blog/${p.slug}`),
  ];
}
