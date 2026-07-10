/**
 * Use-case / persona teasers (S13.8). A single source shared by the homepage teaser; each card links
 * to its dedicated persona page under /use-cases/<id> (S13.11), which routes to the right CTA.
 */
export interface Persona {
  id: string;
  title: string;
  blurb: string;
  /** A live destination today; S13.11 replaces it with /use-cases/<id>. */
  href: string;
  cta: string;
}

export const PERSONAS: Persona[] = [
  {
    id: 'solo',
    title: 'Solo developers',
    blurb:
      'Run the same MCP servers in Claude Code, Cursor, and VS Code without hand-editing three config files. Set it up once; every client stays in sync.',
    href: '/use-cases/solo',
    cta: 'For solo developers',
  },
  {
    id: 'teams',
    title: 'Teams',
    blurb:
      'Share one reviewed config, keep secrets as references, and see every change in an audit trail. The hosted cloud syncs it across the team.',
    href: '/use-cases/teams',
    cta: 'For teams',
  },
  {
    id: 'power-users',
    title: 'Power users',
    blurb:
      'Curate exactly the tools you want from a large directory of MCP servers, and cut the context-window tax on every model call.',
    href: '/use-cases/power-users',
    cta: 'For power users',
  },
];
