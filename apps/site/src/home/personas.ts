/**
 * Use-case / persona teasers (S13.8). A single source shared by the homepage teaser; S13.11 turns
 * each into a dedicated persona page and repoints `href` there. Until then every link points at a
 * live page (no dead links — same precedent as the keyword map's `planned` pages).
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
    href: '/install',
    cta: 'Install the CLI',
  },
  {
    id: 'teams',
    title: 'Teams',
    blurb:
      'Share one reviewed config, keep secrets as references, and see every change in an audit trail. The hosted cloud syncs it across the team.',
    href: '/pricing',
    cta: 'See team cloud',
  },
  {
    id: 'power-users',
    title: 'Power users',
    blurb:
      'Curate exactly the tools you want from a large directory of MCP servers, and cut the context-window tax on every model call.',
    href: '/directory',
    cta: 'Browse the directory',
  },
];
