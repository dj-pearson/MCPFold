/**
 * Site information architecture (S13.9) — the single source for the header nav and the footer link
 * map. Adding a page here registers it in both places (and `liveInternalPaths()` can feed the
 * sitemap). Pages that don't exist yet are marked `planned` and are simply not rendered until their
 * story ships (same "link live only" precedent as the keyword map) — so the nav never 404s.
 */

export interface NavLink {
  label: string;
  href: string;
  /** `planned` links are registered but not rendered until the page exists. Defaults to `live`. */
  status?: 'live' | 'planned';
  external?: boolean;
  description?: string;
}

export interface NavGroup {
  title: string;
  links: NavLink[];
}

const GITHUB = 'https://github.com/dj-pearson/MCPFold';

/** A link is renderable if it's external or a live internal page. */
export function isLive(l: NavLink): boolean {
  return Boolean(l.external) || (l.status ?? 'live') === 'live';
}

/** Primary header navigation (top level). */
export const PRIMARY_NAV: NavLink[] = [
  { label: 'Features', href: '/features', description: 'The four pillars' },
  { label: 'Docs', href: '/docs', description: 'Config format, secrets, adapters, CLI' },
  { label: 'Directory', href: '/directory', description: 'Browse MCP servers' },
  { label: 'Guides', href: '/guides', description: 'Per-client setup' },
  { label: 'Pricing', href: '/pricing', description: 'Free CLI, optional cloud' },
  { label: 'Blog', href: '/blog', description: 'Launches and deep-dives' },
];

/** Header CTAs: primary install action + secondary link into the hosted app. */
export const PRIMARY_CTA: NavLink = { label: 'Install', href: '/install' };
export const SECONDARY_CTA: NavLink = {
  label: 'Open app',
  href: 'https://app.mcpfold.com',
  external: true,
};

/** Complete footer link map, grouped. */
export const FOOTER_GROUPS: NavGroup[] = [
  {
    title: 'Product',
    links: [
      { label: 'Install', href: '/install' },
      { label: 'Directory', href: '/directory' },
      { label: 'Compare', href: '/compare' },
      { label: 'Use cases', href: '/use-cases' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Features', href: '/features' },
      { label: 'Changelog', href: '/changelog' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Documentation', href: '/docs' },
      { label: 'Config format', href: '/docs/config-format.html' },
      { label: 'Secrets', href: '/docs/secrets.html' },
      { label: 'Guides', href: '/guides' },
      { label: 'Glossary', href: '/glossary' },
      { label: 'Roadmap', href: '/roadmap' },
      { label: 'Blog', href: '/blog' },
    ],
  },
  {
    title: 'Community',
    links: [
      { label: 'Community & support', href: '/community' },
      { label: 'GitHub', href: GITHUB, external: true },
      { label: 'Discussions', href: `${GITHUB}/discussions`, external: true },
      { label: 'Sponsor', href: 'https://github.com/sponsors/dj-pearson', external: true },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Security & trust', href: '/security' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
      { label: 'Analytics & cookies', href: '/analytics' },
      { label: 'Brand & press kit', href: '/brand' },
      { label: 'MIT license', href: `${GITHUB}/blob/main/LICENSE`, external: true },
    ],
  },
];

/** Renderable header nav (drops `planned` pages). */
export function liveNav(): NavLink[] {
  return PRIMARY_NAV.filter(isLive);
}

/** Footer groups with `planned` links dropped (and any group that empties out removed). */
export function liveFooterGroups(): NavGroup[] {
  return FOOTER_GROUPS.map((g) => ({ ...g, links: g.links.filter(isLive) })).filter(
    (g) => g.links.length > 0,
  );
}

/** Every live internal path registered in the IA (nav + CTAs + footer) — can feed the sitemap. */
export function liveInternalPaths(): string[] {
  const all: NavLink[] = [
    PRIMARY_CTA,
    SECONDARY_CTA,
    ...PRIMARY_NAV,
    ...FOOTER_GROUPS.flatMap((g) => g.links),
  ];
  return [...new Set(all.filter((l) => isLive(l) && !l.external).map((l) => l.href))];
}
