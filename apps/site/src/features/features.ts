import { CLIENT_IDS } from '@mcpfold/core';
import { compute, FIXTURE_SERVERS } from '../benchmark/model';

/**
 * Feature deep-dive content (S13.10) — one page per pillar under /features. The homepage teases the
 * four pillars; these pages go deep with a concrete example and links to the deep docs.
 *
 * Every NUMBER comes from a committed source so the copy can never drift: the client count is
 * `CLIENT_IDS.length`, and the tool-curation figures are computed live from the same benchmark model
 * the homepage calculator uses (packages/proxy/bench methodology). Descriptive prose (format traps,
 * provider names) states facts already documented in docs/coverage.md and docs/secrets.md.
 */

const CLIENT_COUNT = CLIENT_IDS.length;
const bench = compute(FIXTURE_SERVERS, 3); // published fixture: 45 tools → 9, ~80% fewer tokens

export interface FeatureExample {
  label: string;
  code: string;
}

export interface FeatureLink {
  href: string;
  text: string;
}

export interface Feature {
  /** URL slug: /features/<id>. */
  id: string;
  /** Short nav/card label. */
  nav: string;
  /** Page H1. */
  h1: string;
  /** <title>. */
  metaTitle: string;
  /** One-to-two-sentence extractable, benefit-led summary. */
  tagline: string;
  /** Expanded explanation, one string per paragraph. */
  body: string[];
  /** A concrete config/CLI example. */
  example: FeatureExample;
  /** Links to the deep docs. */
  docs: FeatureLink[];
  /** Other feature ids to cross-link (related features). */
  related: string[];
}

export const FEATURES: readonly Feature[] = [
  {
    id: 'one-config',
    nav: 'One config, every client',
    h1: 'One config, folded out to every client',
    metaTitle: 'One MCP config for every client — mcpfold',
    tagline: `Write your MCP servers once in a single canonical config, and mcpfold renders each client's own native format — so the same servers show up in all ${CLIENT_COUNT} supported clients without hand-editing a different file for each.`,
    body: [
      `Every MCP client stores its servers in its own file and its own shape. The root key alone differs — VS Code uses \`servers\`, Zed uses \`context_servers\`, most others use \`mcpServers\`, Goose uses \`extensions\` — and the on-disk path, restart behavior, and remote-transport format vary too. Adding one server everywhere normally means learning ${CLIENT_COUNT} formats.`,
      'mcpfold quarantines all that per-client churn in a small adapter per client. You keep one canonical `mcp.config.jsonc`; `mcpfold sync` renders each client’s native file from it — byte-deterministically, preserving comments and any unmanaged keys in files clients share with non-MCP settings.',
      'Because the adapters are the single place the format traps live, adding a client is one small module, not an engine change — and the config you maintain never has to know the difference.',
    ],
    example: {
      label: 'One source of truth, folded to every client',
      code: `// mcp.config.jsonc — the one file you maintain
{
  "servers": {
    "github": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"] }
  }
}

$ mcpfold sync   # writes each client's native format (servers / context_servers / mcpServers …)`,
    },
    docs: [
      { href: '/docs/config-format.html', text: 'The config format' },
      { href: '/docs/adapters.html', text: 'How adapters work' },
      { href: '/docs/coverage.html', text: 'Adapter coverage matrix' },
    ],
    related: ['tool-curation', 'sync-drift'],
  },
  {
    id: 'tool-curation',
    nav: 'Curate tools',
    h1: 'Curate tools, cut the context-window tax',
    metaTitle: 'Curate MCP tools, cut context tokens — mcpfold',
    tagline: `Every MCP server dumps its full tool schema into the model's context whether you use those tools or not. Allow- or deny-list tools per server and only what you need loads — the committed benchmark cuts ${bench.toolsBefore} tools to ${bench.toolsAfter} for about ${bench.reductionPct}% fewer tokens.`,
    body: [
      `A model can only reason over what fits in its context window, and that budget is shared with the schema of every tool the connected servers expose. In the published fixture — GitHub, Supabase, and Playwright — that is ${bench.toolsBefore} tools costing roughly ${bench.tokensBefore.toLocaleString('en-US')} tokens before you have done any work.`,
      `mcpfold's proxy lets you allow- or deny-list tools per server, so only the handful you actually use is advertised. Keeping three tools per server in that fixture drops it to ${bench.toolsAfter} tools and about ${bench.tokensAfter.toLocaleString('en-US')} tokens — roughly ${bench.reductionPct}% smaller. The number on this page is computed from the same committed benchmark methodology the docs publish, so the site and the benchmark can never disagree.`,
    ],
    example: {
      label: 'Keep only the tools you use',
      code: `{
  "servers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "tools": { "allow": ["search_issues", "get_file_contents", "create_pull_request"] }
    }
  }
}`,
    },
    docs: [{ href: '/docs/benchmark.html', text: 'The context-window benchmark' }],
    related: ['one-config', 'secrets'],
  },
  {
    id: 'secrets',
    nav: 'Secrets as references',
    h1: 'Secrets as references, never values',
    metaTitle: 'MCP secrets as references, never values — mcpfold',
    tagline:
      'Your config carries ${env:…} / ${op:…} references instead of raw tokens, so nothing sensitive is ever written to a client config or committed to git. mcpfold resolves each reference at fold time, from your environment or secret manager.',
    body: [
      'A secret reference names where a value lives — an environment variable, a dotenv file, or a secret manager such as 1Password or Infisical, plus the OS keychain — instead of embedding the value. The config you edit and commit contains only the reference.',
      'At fold time mcpfold resolves references from the provider you chose and applies each client’s own secret strategy: a shim that resolves at launch, the client’s native input mechanism, or a direct write on your machine. The invariant holds throughout — a reference is never expanded into a value that gets synced to the cloud; only config with references is ever shared.',
      'The result is that credentials stay out of the files most likely to be shared, synced, or accidentally checked in.',
    ],
    example: {
      label: 'A reference, not a token',
      code: `{
  "servers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "\${op:GitHub/token}" }
    }
  }
}`,
    },
    docs: [
      { href: '/docs/secrets.html', text: 'How secrets work' },
      { href: '/security', text: 'Security & trust' },
    ],
    related: ['one-config', 'sync-drift'],
  },
  {
    id: 'sync-drift',
    nav: 'Sync & drift control',
    h1: 'Sync, diff, and drift control',
    metaTitle: 'MCP config sync, diff, and drift control — mcpfold',
    tagline:
      'See exactly what would change before you write it, fold your config out with one command, and catch drift when a client config wanders from the source — in your terminal or as a CI gate.',
    body: [
      '`mcpfold diff` shows the precise, per-client changes a fold would make before anything is written, so a sync is never a surprise. `mcpfold sync` then applies them deterministically, and can back up what it replaces so a change is always reversible.',
      'Because the canonical config is the source of truth, mcpfold can detect drift — a client file that was hand-edited away from the config — and report it. Run that check in CI as a gate so a repo’s committed MCP config and the clients it targets can never silently diverge.',
      'Import works the other way too: `mcpfold import` reads a client’s existing servers back into the canonical format, so adopting mcpfold never means retyping what you already have.',
    ],
    example: {
      label: 'Preview, apply, and guard against drift',
      code: `$ mcpfold diff          # what would change, per client — before writing anything
$ mcpfold sync          # apply it (with a backup of what was replaced)
$ mcpfold diff --check  # non-zero exit if any client drifted — use it as a CI gate`,
    },
    docs: [
      { href: '/docs/cli-contract.html', text: 'The CLI contract' },
      { href: '/docs/github-action.html', text: 'The drift-check GitHub Action' },
    ],
    related: ['one-config', 'secrets'],
  },
];

/** Look up a feature by slug. */
export function featureById(id: string): Feature | undefined {
  return FEATURES.find((f) => f.id === id);
}
