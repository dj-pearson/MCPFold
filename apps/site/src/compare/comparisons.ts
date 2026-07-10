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
  {
    id: 'reduce-mcp-token-usage',
    navLabel: 'Cut MCP token usage',
    metaTitle: 'How to reduce MCP token usage — every approach compared',
    h1: 'How to reduce MCP token usage',
    intro:
      'Reducing MCP token usage means cutting the tool-schema JSON that every connected MCP server loads into the model’s context on each turn — whether the agent uses those tools or not. The main approaches are native tool-search (the model loads tools on demand), schema/response compression, code execution, and deterministic per-client curation. mcpfold takes the curation approach: from one canonical config it loads only the tools each client needs, so the reduction is explicit, reproducible, and works on every client — including Cursor, Windsurf, and Zed, which have no native tool-search.',
    table: {
      columns: ['Native tool-search', 'Schema / response compression', 'Code execution', 'mcpfold'],
      rows: [
        {
          dimension: 'What it does',
          cells: [
            'The model searches the tool catalog and loads a few tools on demand',
            'A proxy shrinks tool schemas and/or trims tool outputs',
            'The agent writes code that calls tools, processing data before returning it',
            'You curate which servers and tools each client loads, from one config',
          ],
        },
        {
          dimension: 'Deterministic (same tools every run)',
          cells: [
            'No — selection is model-driven and can vary',
            'Yes — the same transform each run',
            'Partly — depends on the generated code',
            'Yes — an explicit allow / deny list',
          ],
        },
        {
          dimension: 'Works across every client',
          cells: [
            'No — only clients and models that ship it',
            'Varies by proxy',
            'No — needs a code-execution runtime',
            'Yes — folds to every MCP client from one config',
          ],
        },
        {
          dimension: 'Ties you to a model or platform',
          cells: [
            'Yes — specific models / clients',
            'No',
            'Somewhat — needs a sandbox',
            'No — client- and model-agnostic',
          ],
        },
        {
          dimension: 'Extra service to run',
          cells: [
            'No — built in',
            'Yes — a proxy',
            'Yes — a sandbox',
            'No — a local CLI already in the launch path',
          ],
        },
        {
          dimension: 'Open source',
          cells: ['No — a vendor feature', 'Often', 'Varies', 'Yes — MIT'],
        },
        {
          dimension: 'Best for',
          cells: [
            'One supported client where model-driven selection is fine',
            'Large tool schemas or noisy tool outputs',
            'Data-heavy, multi-step tool pipelines',
            'Multiple clients, or when you want deterministic, auditable tool sets',
          ],
        },
      ],
    },
    body: [
      'The cost is real: a handful of busy MCP servers can spend thousands of tokens on tool definitions before the agent does any work. Anthropic measured an ~85% token reduction when Claude loads tools on demand instead of loading every definition up front — a figure that shows how large the untrimmed baseline is. mcpfold’s own reproducible benchmark trims a representative 45-tool setup down to the 9 tools actually needed and cuts tool-schema tokens by ~80%, with no extra configuration because the shim already in the launch path does the filtering.',
      'Which approach to pick: if you use a single client whose model ships native tool-search and you are comfortable with model-driven selection, that built-in feature is the simplest path. If you run more than one client — or use Cursor, Windsurf, or Zed, which have no native tool-search — deterministic per-client curation with mcpfold is the option that works everywhere from one source of truth. If your problem is giant tool outputs rather than too many tools, add a response-filtering proxy; if you run data-heavy multi-step pipelines, code execution goes furthest. These approaches stack.',
      'mcpfold’s wedge is determinism and reach. Native tool-search searches the catalog and loads tools by inference, which is convenient but non-deterministic and can miss a tool; mcpfold curates an explicit allow / deny set, so the toolset is the same on every run and is auditable in a code review or CI gate. And it curates from one canonical config across every MCP client, rather than being a per-platform feature.',
      'mcpfold composes with native tool-search rather than replacing it: mcpfold decides which servers and tools reach a client at all, and any native tool-search then operates on a smaller, cleaner set. It is deliberately not a schema-compression proxy or a code-execution runtime — for those jobs, the tools built for them fit better, and mcpfold sits happily in front of them.',
    ],
    related: [
      { href: '/mcp-token-calculator', text: 'MCP token calculator — size your own setup' },
      { href: '/compare/mcpfold-vs-tool-search', text: 'mcpfold vs native tool-search' },
      { href: '/features/tool-curation', text: 'Per-server tool curation' },
      { href: '/install', text: 'Install mcpfold' },
    ],
  },
  {
    id: 'mcpfold-vs-tool-search',
    navLabel: 'vs native tool-search',
    metaTitle: 'mcpfold vs native MCP tool-search (deferred tool loading)',
    h1: 'mcpfold vs native tool-search',
    intro:
      'Native tool-search (Anthropic’s Tool Search Tool, OpenAI’s deferred tool loading, GitHub Copilot’s virtual tools) lets the model load MCP tools on demand instead of loading every definition up front, cutting context tokens. mcpfold reaches the same goal by deterministic curation: from one config it loads only the tools each client needs. They are complementary — use mcpfold to trim what reaches a client, and native tool-search to search whatever remains — and mcpfold also covers the clients that have no native tool-search at all.',
    table: {
      columns: ['Native tool-search', 'mcpfold'],
      rows: [
        {
          dimension: 'How tools are chosen',
          cells: [
            'The model searches the catalog and loads a few on demand',
            'You declare an allow / deny set per client',
          ],
        },
        {
          dimension: 'Deterministic',
          cells: ['No — model-driven, can vary run to run', 'Yes — the same toolset every run'],
        },
        {
          dimension: 'Auditable in review / CI',
          cells: ['Hard — selection happens at inference time', 'Yes — the set is in your config'],
        },
        {
          dimension: 'Client / model coverage',
          cells: [
            'Only clients and models that ship it (not Cursor, Windsurf, Zed)',
            'Every MCP client, from one config',
          ],
        },
        {
          dimension: 'Setup',
          cells: ['Built into the platform', 'A local CLI in the launch path'],
        },
        {
          dimension: 'Use them together',
          cells: [
            'Searches whatever tools it is given',
            'Trims the catalog first, so search runs on a smaller, cleaner set',
          ],
        },
      ],
    },
    body: [
      'Native tool-search is a genuine improvement and, where a client ships it, worth turning on — Anthropic reports large token reductions when Claude loads tools on demand. Its trade-off is that selection is model-driven: which tools load can vary between runs, and the mechanism only exists on the clients and models that implement it.',
      'mcpfold curates deterministically. You declare which servers and tools each client should ever see, and mcpfold folds that out to every client in its native format. The toolset is reproducible, reviewable in a pull request, and gateable in CI — the right fit for agents that must behave identically every run, and the only option on clients without native tool-search, such as Cursor (which caps tools and has no tool-search), Windsurf, and Zed.',
      'The two layers compose. Let mcpfold decide what reaches a client at all; let native tool-search search whatever remains. Using them together gives you a smaller, cleaner catalog and on-demand loading on top — better than either alone. mcpfold is not a replacement for native tool-search and does not try to be; it is the deterministic, cross-client config layer underneath it.',
    ],
    related: [
      { href: '/compare/reduce-mcp-token-usage', text: 'How to reduce MCP token usage' },
      { href: '/features/tool-curation', text: 'Per-server tool curation' },
      { href: '/guides/cursor', text: 'Add MCP servers to Cursor' },
      { href: '/install', text: 'Install mcpfold' },
    ],
  },
  {
    id: 'open-source-mcp-gateway',
    navLabel: 'Open-source alternative',
    metaTitle: 'Open-source MCP gateway alternative — local-first, no server',
    h1: 'An open-source, local-first alternative to an MCP gateway',
    intro:
      'MCP gateways centralize your MCP servers behind a service — useful for teams, but it means running (or paying for) a server. mcpfold is an open-source, local-first alternative: it manages your MCP config on your own machine and folds it out to every client, with per-server tool curation and secret references, and no gateway to operate. If you want the benefits of one source of truth without standing up infrastructure, mcpfold is the lighter-weight option.',
    table: {
      columns: ['Hosted SaaS gateway', 'Self-hosted gateway', 'mcpfold'],
      rows: [
        {
          dimension: 'Runs where',
          cells: ['A vendor’s servers', 'A server you operate', 'Locally, as a CLI — no server'],
        },
        {
          dimension: 'Infrastructure to run',
          cells: ['None (theirs)', 'Yes — you host it', 'None — it’s in the launch path'],
        },
        {
          dimension: 'One source for many clients',
          cells: ['Varies by tool', 'Varies by tool', 'Yes — folds to each client’s native format'],
        },
        {
          dimension: 'Open source',
          cells: ['Varies', 'Yes', 'Yes — MIT, free CLI'],
        },
        {
          dimension: 'Secret handling',
          cells: [
            'Stored by the service',
            'Stored by your instance',
            'References resolved locally; values never synced',
          ],
        },
        {
          dimension: 'Per-server tool curation',
          cells: ['Varies by tool', 'Varies by tool', 'Allow / deny lists, deterministic'],
        },
        {
          dimension: 'Team RBAC / org audit',
          cells: [
            'Yes — their focus',
            'Yes',
            'Not a goal — local-first (optional cloud for sharing)',
          ],
        },
        {
          dimension: 'Best for',
          cells: [
            'Teams wanting a managed gateway',
            'Teams that must self-host a gateway',
            'Anyone wanting one config across their own clients, no server',
          ],
        },
      ],
    },
    body: [
      'A gateway is the right shape when an organization wants to run MCP servers centrally, behind access control and an audit trail — that is a real, different job, and tools built for it fit teams that need it. The trade-off is operational: a SaaS gateway is another vendor in your stack, and a self-hosted one is another service to run and secure.',
      'mcpfold takes the opposite, local-first approach. It keeps one canonical config on your machine and folds it out to every client in that client’s native format, curates which tools each client loads to cut context tokens, and stores secrets as references that are resolved at launch — never written to disk. There is nothing to host: the curation happens in a shim already in the launch path.',
      'mcpfold is deliberately not a hosted, multi-tenant gateway: there is no server-side RBAC or org audit, and it does not run servers for you. If you opt into the optional cloud to share config across a team, only the config with secret references is synced — never secret values. For an individual or a small team that wants one honest source of truth without standing up infrastructure, that is exactly the point.',
    ],
    related: [
      { href: '/compare/mcp-config-manager', text: 'Where mcpfold fits vs a gateway' },
      { href: '/compare/reduce-mcp-token-usage', text: 'How to reduce MCP token usage' },
      { href: '/security', text: 'How mcpfold handles secrets' },
      { href: '/install', text: 'Install mcpfold' },
    ],
  },
];

/** Look up a comparison by slug. */
export function comparisonById(id: string): Comparison | undefined {
  return COMPARISONS.find((c) => c.id === id);
}
