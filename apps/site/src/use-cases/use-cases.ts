/**
 * Use-case / persona pages (S13.11). The same product, reframed around a specific visitor's problem,
 * each routing to the right next step: solo devs → install; teams → the repo-committed wedge and
 * (optional) cloud → pricing; power users → the directory. Ids match the homepage persona teasers
 * (home/personas.ts), which repoint to these pages.
 *
 * Positioning stays within the PRD non-goals: mcpfold is a local-first CLI + curation tool, and the
 * team cloud is an OPTIONAL, self-hostable shared-config/audit/sync layer — NOT a hosted enterprise
 * MCP gateway. No implied endorsement of the MCP project.
 */

export interface UseCaseLink {
  href: string;
  text: string;
}

export interface UseCase {
  /** URL slug: /use-cases/<id>. Matches the homepage persona id. */
  id: string;
  /** Short nav/breadcrumb label. */
  nav: string;
  h1: string;
  metaTitle: string;
  /** One-to-two-sentence extractable framing. */
  tagline: string;
  body: string[];
  /** Benefit bullets reusing real product facts. */
  highlights: Array<{ title: string; text: string }>;
  /** The primary call to action for this persona. */
  primaryCta: UseCaseLink;
  secondaryCta?: UseCaseLink;
  /** Other persona ids to cross-link. */
  related: string[];
}

export const USE_CASES: readonly UseCase[] = [
  {
    id: 'solo',
    nav: 'Solo developers',
    h1: 'mcpfold for solo developers',
    metaTitle: 'mcpfold for solo developers — one MCP config across your clients',
    tagline:
      'If you use more than one AI client, mcpfold keeps your MCP servers in one config and folds them out to every client — so you set a server up once, not once per tool.',
    body: [
      'You run Claude Code, Cursor, and VS Code — and each keeps its MCP servers in its own file and its own shape. Adding one server everywhere means editing several config files by hand and keeping them in sync.',
      'With mcpfold you maintain one canonical `mcp.config.jsonc` and run `mcpfold sync`; each client’s native config is written from it. Curate the tools you actually use to keep your context window lean, and keep API tokens as `${env:…}` / `${op:…}` references instead of pasting them into config files.',
      'Everything runs locally on your machine — no account, no cloud required. Install it and import what you already have in one step.',
    ],
    highlights: [
      {
        title: 'One config, every client',
        text: 'Write servers once; mcpfold renders each client’s native format.',
      },
      {
        title: 'Curate tools',
        text: 'Allow/deny tools per server so only what you need loads.',
      },
      {
        title: 'Secrets as references',
        text: 'Tokens stay as references, never written into a client config.',
      },
      {
        title: 'Local-first',
        text: 'No account needed — the CLI is free and MIT-licensed.',
      },
    ],
    primaryCta: { href: '/install', text: 'Install mcpfold' },
    secondaryCta: { href: '/directory', text: 'Browse the MCP server directory' },
    related: ['teams', 'power-users'],
  },
  {
    id: 'teams',
    nav: 'Teams',
    h1: 'mcpfold for teams',
    metaTitle: 'mcpfold for teams — standardize MCP setup from one config',
    tagline:
      'Standardize your team’s MCP setup from one repo-committed config: everyone folds the same servers to their own clients, a CI drift gate keeps them in sync, and secrets stay references — no hosted gateway required.',
    body: [
      'Commit one reviewed `mcp.config.jsonc` to your repo. Every teammate runs `mcpfold sync` to fold it into whatever clients they use, so the whole team runs the same, reviewed set of MCP servers without a shared machine or a hosted service. Add `mcpfold diff --check` to CI as a drift gate, and a client config can never silently wander from the committed source.',
      'Secrets stay as references in the committed config — each developer resolves them locally from their own environment or secret manager — so a shared config never carries a raw token. This repo-committed workflow is the whole team wedge, and it is entirely free and local.',
      'When you want shared config, an audit trail, and sync managed for you, the optional hosted cloud adds that on top — and only ever syncs config with secret references, never secret values. It is self-hostable, and mcpfold stays local-first: it is not a hosted enterprise MCP gateway with server-side access control, and does not aim to be.',
    ],
    highlights: [
      {
        title: 'Repo-committed config',
        text: 'One reviewed config; everyone folds the same servers to their clients.',
      },
      {
        title: 'CI drift gate',
        text: '`mcpfold diff --check` fails the build if a client drifts from the source.',
      },
      {
        title: 'References, never values',
        text: 'Secrets stay references; the cloud never syncs secret values.',
      },
      {
        title: 'Optional, self-hostable cloud',
        text: 'Shared config + audit + sync when you want it — or self-host it for free.',
      },
    ],
    primaryCta: { href: '/pricing', text: 'See team pricing' },
    secondaryCta: { href: '/docs/team-config-as-code.html', text: 'Team config-as-code guide' },
    related: ['solo', 'power-users'],
  },
  {
    id: 'power-users',
    nav: 'Power users',
    h1: 'mcpfold for power users',
    metaTitle: 'mcpfold for power users — curate tools, cut the context tax',
    tagline:
      'Curate exactly the tools you want from a large directory of MCP servers, and cut the context-window tax on every model call — with one config that folds out to every client.',
    body: [
      'Every MCP server advertises its full tool schema whether or not you use those tools, and all of it counts against the model’s context window. Load several servers and a large share of the window is spent before you have done any work.',
      'mcpfold’s proxy lets you allow- or deny-list tools per server, so only the handful you use is exposed. Browse the community directory, add any server in one command with pinned versions and integrity where available, and keep the whole setup in one canonical config that syncs to every client.',
      'The committed benchmark quantifies the savings, so the trade-off is measured, not asserted.',
    ],
    highlights: [
      {
        title: 'Per-server tool curation',
        text: 'Allow/deny lists trim each server to the tools you actually call.',
      },
      {
        title: 'A curated directory',
        text: 'Add any server in one command — pinned and integrity-checked where available.',
      },
      {
        title: 'Measured savings',
        text: 'The committed benchmark shows the context-window reduction.',
      },
    ],
    primaryCta: { href: '/directory', text: 'Browse the MCP server directory' },
    secondaryCta: { href: '/docs/benchmark.html', text: 'See the token benchmark' },
    related: ['solo', 'teams'],
  },
];

/** Look up a use-case by slug. */
export function useCaseById(id: string): UseCase | undefined {
  return USE_CASES.find((u) => u.id === id);
}
