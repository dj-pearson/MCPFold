/**
 * Glossary / concept hub content (S15.6). The head terms in this space ("mcp server", "model context
 * protocol", "mcp client", "mcp tools", …) are informational queries that assistants answer from, so
 * mcpfold earns topical authority with concise, accurate, neutral definitional pages that link down
 * to the product, directory, and docs.
 *
 * Each term leads with a one-to-two-sentence EXTRACTABLE definition (`short`) — the sentence a search
 * engine or AI can lift verbatim — then expands in `body`. Copy is deliberately neutral about the MCP
 * project: mcpfold is an independent tool and describes the protocol factually, with no implied
 * affiliation or endorsement.
 */

export interface GlossaryLink {
  href: string;
  text: string;
}

export interface GlossaryTerm {
  /** URL slug: /glossary/<id>. */
  id: string;
  /** The canonical term, as a DefinedTerm name (e.g. "MCP server"). */
  term: string;
  /** The page H1/title question, phrased naturally (article + plurality vary per term). */
  heading: string;
  /** Common alternate spellings/phrasings, for the page subtitle and search context. */
  aka?: string[];
  /** One-to-two-sentence extractable definition. Kept self-contained (no "it"/"this" openers). */
  short: string;
  /** Expanded explanation, one string per paragraph. */
  body: string[];
  /** Internal links down to product/directory/docs (topical-authority link graph). */
  related: GlossaryLink[];
}

export const GLOSSARY: readonly GlossaryTerm[] = [
  {
    id: 'mcp-server',
    term: 'MCP server',
    heading: 'What is an MCP server?',
    aka: ['MCP servers', 'model context protocol server'],
    short:
      'An MCP server is a program that exposes tools, resources, and prompts to AI applications over the Model Context Protocol, so any compatible client can use its capabilities.',
    body: [
      'An MCP server wraps some capability — reading files, querying a database, searching the web, calling an API — and advertises it through the Model Context Protocol. When an AI application connects, the server tells it which tools and resources are available, and the model can then invoke them during a conversation.',
      'Servers run either locally as a subprocess the client launches over stdio, or remotely as an HTTP service the client connects to. The same server can be used by many different clients, because they all speak the one protocol.',
      'With mcpfold you declare each MCP server once in a single config file and fold that out to every client you use, instead of adding the server by hand in each application separately.',
    ],
    related: [
      { href: '/directory', text: 'Browse the MCP server directory' },
      { href: '/install', text: 'Install mcpfold' },
      { href: '/docs/config-format.html', text: 'The config format' },
    ],
  },
  {
    id: 'model-context-protocol',
    term: 'Model Context Protocol',
    heading: 'What is the Model Context Protocol?',
    aka: ['MCP', 'model context protocol'],
    short:
      'The Model Context Protocol (MCP) is an open standard for connecting AI applications to external tools and data sources through a common client–server interface.',
    body: [
      'The Model Context Protocol defines how an AI application (the client) and a capability provider (the server) exchange messages: how a server advertises its tools, resources, and prompts, and how a client calls them. Because the interface is standardized, any compliant client can work with any compliant server.',
      'The protocol was introduced by Anthropic in late 2024 and is published as an open specification that anyone can implement. mcpfold is an independent tool built on top of the protocol and is not affiliated with or endorsed by the MCP project.',
      'A growing set of clients — including Claude Code, Cursor, VS Code, and many others — implement MCP, which is what lets one mcpfold config serve all of them.',
    ],
    related: [
      { href: '/glossary/mcp-server', text: 'What is an MCP server?' },
      { href: '/glossary/mcp-client', text: 'What is an MCP client?' },
      { href: '/directory', text: 'MCP server directory' },
    ],
  },
  {
    id: 'mcp-client',
    term: 'MCP client',
    heading: 'What is an MCP client?',
    aka: ['MCP clients', 'model context protocol client'],
    short:
      'An MCP client is the part of an AI application — an editor, chat app, or agent — that connects to MCP servers and lets the model use their tools.',
    body: [
      'The client is the consumer side of the Model Context Protocol. It launches or connects to one or more MCP servers, discovers the tools they expose, and mediates the model’s calls to those tools. Each client stores its MCP configuration in its own file and format.',
      'Editors and assistants such as Claude Code, Cursor, VS Code, Windsurf, and Zed are all MCP clients. Because each keeps its own config, adding a server everywhere normally means editing many different files.',
      'mcpfold renders each client’s native config from one canonical source, so the same servers appear in every client without per-client hand-editing.',
    ],
    related: [
      { href: '/directory', text: 'MCP server directory' },
      { href: '/glossary/mcp-config-manager', text: 'What is an MCP config manager?' },
      { href: '/install', text: 'Install mcpfold' },
    ],
  },
  {
    id: 'mcp-tools',
    term: 'MCP tools',
    heading: 'What are MCP tools?',
    aka: ['MCP tool', 'tools'],
    short:
      'MCP tools are the individual actions an MCP server exposes to a model — each with a name, a description, and a JSON-Schema definition of its inputs.',
    body: [
      'When a client connects to a server, the server lists its tools. Each tool has a machine-readable schema so the model knows what arguments it takes, and a description so the model knows when to use it. The model can then choose to call a tool, and the server runs it and returns the result.',
      'Every tool a server advertises adds its schema to the model’s context, whether or not it is ever used. Loading many servers can therefore consume a large share of the context window.',
      'mcpfold lets you allow- or deny-list tools per server, so only the tools you actually need are exposed — keeping the context window lean.',
    ],
    related: [
      { href: '/glossary/context-window', text: 'What is a context window?' },
      { href: '/docs/benchmark.html', text: 'The token-savings benchmark' },
      { href: '/directory', text: 'MCP server directory' },
    ],
  },
  {
    id: 'context-window',
    term: 'Context window',
    heading: 'What is a context window?',
    aka: ['context window', 'context length'],
    short:
      'A context window is the maximum amount of text, measured in tokens, that a language model can consider at once — including every MCP tool schema loaded into it.',
    body: [
      'A model can only reason over what fits in its context window. That budget is shared across the system prompt, the conversation, any retrieved content, and the schemas of every tool the connected MCP servers expose.',
      'Because tool schemas are counted whether or not the tools are used, connecting many MCP servers can quietly spend a meaningful fraction of the window before the real work begins.',
      'Curating which servers and tools load — the core of what mcpfold does — keeps more of the context window available for the task at hand. The committed benchmark quantifies the savings.',
    ],
    related: [
      { href: '/glossary/mcp-tools', text: 'What are MCP tools?' },
      { href: '/docs/benchmark.html', text: 'See the benchmark' },
    ],
  },
  {
    id: 'secret-reference',
    term: 'Secret reference',
    heading: 'What is a secret reference?',
    aka: ['secret references', 'secret placeholder'],
    short:
      'A secret reference is a placeholder such as ${env:GITHUB_TOKEN} that points to a secret stored elsewhere, so the raw value is never written into a config file.',
    body: [
      'Instead of pasting an API key or token directly into a client’s MCP config, a secret reference names where the value lives — an environment variable, a dotenv file, or a secret manager such as 1Password or Infisical. The config carries only the reference.',
      'mcpfold resolves each reference at fold time, from your environment or secret manager, so nothing sensitive is written to a client config or committed to git. Some clients can even receive the reference natively via their own input mechanism.',
      'This keeps credentials out of the files that are most likely to be shared, synced, or accidentally checked in.',
    ],
    related: [
      { href: '/docs/secrets.html', text: 'How secrets work' },
      { href: '/security', text: 'Security & trust' },
    ],
  },
  {
    id: 'mcp-config-manager',
    term: 'MCP config manager',
    heading: 'What is an MCP config manager?',
    aka: ['MCP configuration manager', 'MCP config tool'],
    short:
      'An MCP config manager is a tool that maintains your MCP servers in one source of truth and applies that configuration across every client, instead of hand-editing a separate file per application.',
    body: [
      'As soon as you use more than one MCP client, each keeps its own configuration file in its own format. Adding, removing, or updating a server means repeating the edit everywhere and keeping the copies in sync by hand.',
      'An MCP config manager centralizes that: you declare each server once, and the tool renders each client’s native config from the single source. Secrets stay as references, versions can be pinned, and drift between clients disappears.',
      'mcpfold is an MCP config manager: one canonical mcp.config.jsonc, folded out to every supported client with one command.',
    ],
    related: [
      { href: '/install', text: 'Install mcpfold' },
      { href: '/directory', text: 'MCP server directory' },
      { href: '/glossary/mcp-client', text: 'What is an MCP client?' },
    ],
  },
];

/** Look up a glossary term by slug. */
export function termById(id: string): GlossaryTerm | undefined {
  return GLOSSARY.find((t) => t.id === id);
}
