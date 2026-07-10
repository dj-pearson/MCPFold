import { SITE_URL } from './meta';
import type { JsonLd } from './jsonld';

/**
 * GEO answer layer (S15.2): extraction-friendly FAQ units. Each answer is **self-contained** (it
 * reads correctly lifted out of context) and answer-first (the definition/answer is in the first
 * sentence). The same data renders as a visible FAQ section AND as FAQPage JSON-LD, so answer
 * engines (Claude / ChatGPT / Perplexity) can quote mcpfold accurately.
 */

export interface Faq {
  question: string;
  answer: string;
}

const HOME: Faq[] = [
  {
    question: 'What is mcpfold?',
    answer:
      'mcpfold is a free, open-source CLI that keeps one canonical config for your MCP (Model Context Protocol) servers and folds it out to every client — Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Zed, and more — each in its own native format. You write your servers once; mcpfold renders the right file for each tool.',
  },
  {
    question: 'How does mcpfold handle secrets?',
    answer:
      'mcpfold stores secrets as references (for example ${env:GITHUB_PAT} or ${op:vault/item/field}), never as raw values. The reference is the only thing committed to git; the actual secret is resolved from your environment or secret manager at fold time, so credentials are never written to a client config on disk.',
  },
  {
    question: 'Which MCP clients does mcpfold support?',
    answer:
      'mcpfold folds to 18 clients from one config: Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Zed, Cline, Gemini CLI, JetBrains AI Assistant, Visual Studio, Continue, Roo Code, Goose, Codex CLI, LM Studio, Warp, opencode, and GitHub Copilot CLI. Each client has its own config format and path — including YAML (Goose) and TOML (Codex CLI) — and mcpfold handles the per-client dialect automatically.',
  },
  {
    question: 'How does mcpfold reduce MCP token usage?',
    answer:
      'mcpfold reduces MCP token usage by curating which tools each client loads, from one canonical config, so only the tools an agent actually needs enter its context window. Every connected MCP server otherwise dumps its full tool schema into context on every turn, used or not. In a reproducible benchmark, trimming a 45-tool setup to the 9 tools actually needed cut tool-schema tokens by about 80% (7,476 to 1,497), with no extra configuration.',
  },
  {
    question: 'Do I still need mcpfold if my client has native tool-search?',
    answer:
      'They complement each other. Native tool-search (such as Claude’s Tool Search Tool or OpenAI’s deferred tool loading) lets a model load tools on demand, but it is model-driven, non-deterministic, and only exists on the clients and models that ship it. mcpfold curates deterministically from one config across every MCP client — including Cursor, Windsurf, and Zed, which have no native tool-search — and trims the catalog before any native tool-search runs, so the two layers stack.',
  },
  {
    question: 'Is mcpfold free?',
    answer:
      'Yes. The entire mcpfold CLI — every adapter, the canonical config, secret references, sync, diff, doctor, and the config-as-code CI gate — is free and open source under the MIT license, with no account required. Optional paid cloud features add team config sharing, roles, and an audit trail.',
  },
];

const INSTALL: Faq[] = [
  {
    question: 'How do I install mcpfold?',
    answer:
      'Run mcpfold with no install using "npx mcpfold@latest", install it globally with "npm install -g mcpfold", or use a standalone binary via Homebrew ("brew install mcpfold") or Scoop. mcpfold needs Node.js 20+ for the npm paths; the standalone binaries bundle their own runtime.',
  },
  {
    question: 'Do I need an account to use mcpfold?',
    answer:
      'No. mcpfold is local-first — init, import, sync, diff, doctor, and run all work entirely offline with no account and no server. An account is only needed for the optional cloud features (config sync across machines and team sharing).',
  },
];

const DIRECTORY: Faq[] = [
  {
    question: 'What is the mcpfold MCP server directory?',
    answer:
      'The mcpfold directory is a curated, community-maintained list of Model Context Protocol servers you can add to your config in one command. Each entry links to a server you can install; mcpfold pins it to an exact version and stores any credentials as references rather than values.',
  },
  {
    question: 'How do I add an MCP server with mcpfold?',
    answer:
      'Run "mcpfold add <name> --from-registry" to resolve a server from the official MCP registry into a pinned, integrity-hashed, reference-only entry in your canonical config, or "mcpfold add <name> --url <url>" / "--package <spec>" to add one by hand. Then "mcpfold sync" folds it out to every client.',
  },
];

const PRICING: Faq[] = [
  {
    question: 'How much does mcpfold cost?',
    answer:
      'The mcpfold CLI is free forever under the MIT license. Cloud Free ($0) adds config sync for one person across machines; the Team tier ($6/user/month) adds shared team configs, roles, and an audit trail; Enterprise adds SSO and support. Nothing in the local CLI is gated.',
  },
  {
    question: 'Can I self-host the mcpfold cloud?',
    answer:
      'Yes — the entire mcpfold cloud (Supabase plus the edge service) is MIT-licensed and self-hostable at no cost. The paid tiers are the convenience of us running it plus the Team/Enterprise features; the code itself is open.',
  },
  {
    question: 'What is the mcpfold license?',
    answer:
      'The mcpfold CLI, adapters, core, and the self-hostable cloud are all MIT-licensed. Only the hosted mcpfold.com service and its Team/Enterprise features are commercial.',
  },
  {
    question: 'What data does the mcpfold cloud store?',
    answer:
      'The mcpfold cloud stores only your canonical config with secret references (${provider:path}) — never secret values. Everything sensitive stays on your machine and is resolved at launch time.',
  },
];

/** The FAQs for a pathname (empty when the page has none). */
export function faqsForPath(path: string): Faq[] {
  const p = path !== '/' && path.endsWith('/') ? path.slice(0, -1) : path;
  if (p === '/') return HOME;
  if (p === '/install') return INSTALL;
  if (p === '/directory') return DIRECTORY;
  if (p === '/pricing') return PRICING;
  return [];
}

/** A schema.org FAQPage node for a set of Q&A units. */
export function faqPageJsonLd(faqs: Faq[], path: string): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    url: `${SITE_URL}${path === '/' ? '' : path}`,
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };
}
