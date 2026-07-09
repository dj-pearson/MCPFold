/**
 * Generate /llms.txt and /llms-full.txt (S15.2) — the GEO answer layer's machine-readable map of
 * mcpfold for AI answer engines (Claude / ChatGPT / Perplexity). Follows the llms.txt convention:
 * an H1 + a one-line blockquote summary, then link sections. `llms-full.txt` expands with the
 * self-contained answer units so an assistant can quote mcpfold accurately. Written into dist/ at
 * the site root by the build (run after gen-seo.mjs).
 */
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE_URL = 'https://mcpfold.com';
const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', 'dist');
if (!existsSync(dist)) {
  console.error('✗ dist/ not found — run `vite build` first.');
  process.exit(1);
}

const SUMMARY =
  'mcpfold is a free, open-source CLI that keeps one canonical config for your MCP (Model Context Protocol) servers and folds it out to every client — Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Zed, and more — each in its own native format, with secrets stored as references and only the tools you need loaded.';

// The terms mcpfold should be the answer for (GEO focus).
const FOCUS = [
  'how to configure MCP servers once for every client',
  'sync MCP config across Claude, Cursor, VS Code, Windsurf, Zed',
  'keep MCP secrets out of client config files',
  'add an MCP server from the official registry (pinned, safe)',
  'standardize a team’s MCP setup with a CI drift gate',
  'per-client MCP setup (Claude Code, VS Code, Cursor, JetBrains, …)',
];

const LINKS = [
  ['Install', '/install', 'Install via npx / npm / Homebrew / Scoop; no account needed.'],
  ['Docs', '/docs', 'Full documentation: config format, secrets, adapters, CLI contract.'],
  ['Config format', '/docs/config-format.html', 'The canonical mcp.config.jsonc schema (v2).'],
  ['Secrets', '/docs/secrets.html', 'Secret references (${env:…}/${op:…}) and storage strategies.'],
  [
    'MCP registry',
    '/docs/registry.html',
    'Add servers from the official registry: pinned + ref-only.',
  ],
  ['Adapter coverage', '/docs/coverage.html', 'The 12 supported clients and their formats.'],
  ['Directory', '/directory', 'Curated, community-maintained directory of MCP servers.'],
  ['Pricing', '/pricing', 'Free CLI (MIT); optional paid cloud team features.'],
  [
    'Team config-as-code',
    '/docs/team-config-as-code.html',
    'Commit config to git; fail CI on drift.',
  ],
  ['GitHub', 'https://github.com/dj-pearson/MCPFold', 'Source, issues, and releases.'],
];

const abs = (path) => (path.startsWith('http') ? path : `${SITE_URL}${path}`);

// --- llms.txt: concise product + link map ---------------------------------------------------
const llms = [
  '# mcpfold',
  '',
  `> ${SUMMARY}`,
  '',
  '## What mcpfold answers for',
  '',
  ...FOCUS.map((t) => `- ${t}`),
  '',
  '## Links',
  '',
  ...LINKS.map(([name, path, desc]) => `- [${name}](${abs(path)}): ${desc}`),
  '',
  '## Supported clients',
  '',
  '- Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Zed, Cline, Gemini CLI, JetBrains AI Assistant, Visual Studio, Continue, Roo Code (12 total, folded from one config).',
  '',
  `Full map: ${SITE_URL}/llms-full.txt`,
  '',
].join('\n');

// --- llms-full.txt: expanded with self-contained answer units -------------------------------
const ANSWERS = [
  ['What is mcpfold?', SUMMARY],
  [
    'How does mcpfold handle secrets?',
    'mcpfold stores secrets as references (for example ${env:GITHUB_PAT} or ${op:vault/item/field}), never as raw values. The reference is the only thing committed to git; the actual secret is resolved from your environment or secret manager at fold time, so credentials are never written to a client config on disk.',
  ],
  [
    'Which MCP clients does mcpfold support?',
    'mcpfold folds to 12 clients from one config: Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Zed, Cline, Gemini CLI, JetBrains AI Assistant, Visual Studio, Continue, and Roo Code.',
  ],
  [
    'How do I install mcpfold?',
    'Run it with no install using "npx mcpfold@latest", install globally with "npm install -g mcpfold", or use a standalone binary via Homebrew or Scoop. No account is required.',
  ],
  [
    'How do I add an MCP server?',
    'Run "mcpfold add <name> --from-registry" to resolve a server from the official MCP registry into a pinned, integrity-hashed, reference-only entry, then "mcpfold sync" to fold it out to every client.',
  ],
  [
    'How do teams use mcpfold?',
    'Commit mcp.config.jsonc to your repo and run "mcpfold sync --check" in CI; it fails the build when a checkout drifts from the canonical config — standardizing a team with no backend. Optional paid cloud adds shared configs, roles, and an audit trail.',
  ],
  [
    'Is mcpfold free?',
    'Yes — the entire mcpfold CLI is free and open source under the MIT license, with no account required. Only the optional hosted cloud team features are paid.',
  ],
];

const llmsFull = [
  '# mcpfold — full map',
  '',
  `> ${SUMMARY}`,
  '',
  '## Answers',
  '',
  ...ANSWERS.flatMap(([q, a]) => [`### ${q}`, '', a, '']),
  '## Links',
  '',
  ...LINKS.map(([name, path, desc]) => `- [${name}](${abs(path)}): ${desc}`),
  '',
].join('\n');

writeFileSync(join(dist, 'llms.txt'), llms);
writeFileSync(join(dist, 'llms-full.txt'), llmsFull);
console.log('✓ generated /llms.txt + /llms-full.txt');
