/**
 * Comparison / alternatives content (S15.7). Consideration-stage searchers and AI answers reach for
 * comparisons ("MCP config manager", "managing MCP servers manually vs …", "where does X fit"). These
 * pages give a fair, factual source to rank for those modifier queries and to be cited by assistants.
 *
 * Framing rules (enforced by review against the PRD non-goals):
 *   - mcpfold is a LOCAL-FIRST CLI + curation tool, NOT a hosted enterprise gateway (no server-side
 *     RBAC / org audit / hosted servers — that is the Composio/MintMCP space).
 *   - Only config with secret REFERENCES is ever synced — never secret values.
 *   - No implied official MCP endorsement; other tools are described neutrally, never disparaged, and
 *     only with claims that are defensible and verifiable.
 */

export interface CompareLink {
  href: string;
  text: string;
}

export interface CompareTable {
  /** Column headers; the first row of the rendered <table>. The last column is always mcpfold. */
  columns: string[];
  /** One row per dimension; `cells` aligns 1:1 with `columns`. */
  rows: Array<{ dimension: string; cells: string[] }>;
}

export interface Comparison {
  /** URL slug: /compare/<id>. */
  id: string;
  /** Short label for hub cards and nav. */
  navLabel: string;
  /** <title>. */
  metaTitle: string;
  /** Page H1. */
  h1: string;
  /** One-to-two-sentence extractable summary of the comparison. */
  intro: string;
  table: CompareTable;
  /** Honest trade-off prose, including what mcpfold is NOT. One string per paragraph. */
  body: string[];
  related: CompareLink[];
}

export const COMPARISONS: readonly Comparison[] = [
  {
    id: 'manual-vs-mcpfold',
    navLabel: 'By hand vs mcpfold',
    metaTitle: 'Managing MCP servers by hand vs mcpfold · comparison',
    h1: 'Managing MCP servers by hand vs mcpfold',
    intro:
      'Editing each client’s MCP config by hand is perfectly reasonable for a single tool, but mcpfold pays off as soon as you run more than one MCP client: you keep one canonical config and fold it out to all of them, with secrets kept as references instead of pasted into files.',
    table: {
      columns: ['By hand', 'mcpfold'],
      rows: [
        {
          dimension: 'Source of truth',
          cells: ['A separate config file per client', 'One canonical mcp.config.jsonc'],
        },
        {
          dimension: 'Adding a server',
          cells: ['Edit each client’s file yourself', 'mcpfold add, then sync to every client'],
        },
        {
          dimension: 'Secrets',
          cells: [
            'Pasted into each client’s config file',
            '${env:…} / ${op:…} references resolved at fold time',
          ],
        },
        {
          dimension: 'Keeping clients in sync',
          cells: ['Copy changes between files by hand', 'One mcpfold sync'],
        },
        {
          dimension: 'Curating tools per server',
          cells: ['Hand-edit each client’s JSON', 'Allow / deny-list tools per server'],
        },
        {
          dimension: 'Runs where',
          cells: ['In each client', 'Locally, as a CLI'],
        },
        {
          dimension: 'Cost',
          cells: ['Free', 'Free, MIT-licensed CLI'],
        },
      ],
    },
    body: [
      'If you only use one MCP client, editing its config directly is a fine choice — there is nothing to fold out, and no tool to add. The case for mcpfold grows with each additional client you keep in sync.',
      'mcpfold is a local-first CLI. It adds one tool to install and learn, in exchange for removing the per-client copy-paste and keeping secrets out of config files. Everything it does happens on your own machine.',
      'mcpfold is deliberately not a hosted service or an enterprise gateway: there is no server-side access control, org audit, or hosted MCP servers. If you opt into the optional cloud for sharing config across a team, only the config with secret references is ever synced — never the secret values themselves.',
    ],
    related: [
      { href: '/install', text: 'Install mcpfold' },
      { href: '/directory', text: 'Browse the MCP server directory' },
      { href: '/compare/mcp-config-manager', text: 'Where mcpfold fits' },
    ],
  },
  {
    id: 'mcp-config-manager',
    navLabel: 'Where mcpfold fits',
    metaTitle: 'MCP config manager — where mcpfold fits · comparison',
    h1: 'MCP config manager: where mcpfold fits',
    intro:
      'An MCP config manager keeps your MCP servers in one place and applies them across clients. mcpfold is a local-first, open-source config manager — one config folded out to every client, with per-server tool curation and secret references — as distinct from hosted MCP gateways that run servers for a team.',
    table: {
      columns: ['By hand', 'Hosted MCP gateway', 'mcpfold'],
      rows: [
        {
          dimension: 'Runs where',
          cells: ['In each client’s file', 'On a hosted server', 'Locally, as a CLI'],
        },
        {
          dimension: 'One source for many clients',
          cells: ['No', 'Varies by tool', 'Yes — folds to each client’s native format'],
        },
        {
          dimension: 'Team RBAC / org audit',
          cells: ['No', 'Yes — their focus', 'Not a goal — local-first'],
        },
        {
          dimension: 'Hosted / managed servers',
          cells: ['No', 'Yes — their focus', 'No — you run your own'],
        },
        {
          dimension: 'Secret handling',
          cells: [
            'Pasted into files',
            'Stored by the service',
            'References resolved locally; values never synced',
          ],
        },
        {
          dimension: 'Per-server tool curation',
          cells: ['Manual', 'Varies by tool', 'Allow / deny lists'],
        },
        {
          dimension: 'Open source',
          cells: ['n/a', 'Varies by tool', 'Yes — MIT, free CLI'],
        },
        {
          dimension: 'Best for',
          cells: [
            'A single client',
            'Teams wanting a managed gateway',
            'Anyone using multiple clients locally',
          ],
        },
      ],
    },
    body: [
      'Hosted MCP gateways — for example Composio or MintMCP — run MCP servers for a team and add server-side features such as role-based access control and organization audit logs. That is a different job from mcpfold’s, and for teams that want a managed, multi-tenant gateway those tools fit better.',
      'mcpfold stays local-first by design: it manages MCP configuration on your machine and folds it out to your own clients, with tool curation and secret references. It is not a hosted gateway and does not aim to be — no hosted servers, no server-side access control.',
      'If you want one honest source of truth for your own MCP config across every client you use, that is what mcpfold is for. If you want a hosted gateway that runs servers for an organization, a tool built for that will serve you better — the two are complementary, not competitors.',
    ],
    related: [
      { href: '/install', text: 'Install mcpfold' },
      { href: '/pricing', text: 'Pricing (free CLI, optional cloud)' },
      { href: '/compare/manual-vs-mcpfold', text: 'By hand vs mcpfold' },
    ],
  },
];

/** Look up a comparison by slug. */
export function comparisonById(id: string): Comparison | undefined {
  return COMPARISONS.find((c) => c.id === id);
}
