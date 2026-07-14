import { UsageError } from '@mcpfold/core';
import type { CommandOutput } from '../output/render.js';
import { style } from '../util/style.js';

/**
 * `mcpfold explain <topic|finding-id>` (S25.5) — offline, authored long-form explanations of each
 * doctor finding class and core config concept. There is no network and no generation: the catalog is
 * static, versioned in this file, and every `doctor` finding points here via a `see:` id. It teaches
 * *why* a footgun matters and *why* the fix is right, so users learn the model instead of blindly
 * applying fixes.
 */

export interface ExplainEntry {
  /** Stable id (matches the `explain` field a doctor finding carries). */
  id: string;
  title: string;
  /** One-line gist. */
  summary: string;
  /** The full explanation (already wrapped as prose paragraphs). */
  body: string;
  /** Related topic ids. */
  related?: string[];
}

/**
 * The catalog. Keys are the ids doctor findings reference. Keep an entry for every finding class the
 * checks can emit — a CI test (`explain.test.ts`) asserts there are no orphans in either direction.
 */
export const EXPLAIN: Record<string, ExplainEntry> = {
  'vscode-root-key': {
    id: 'vscode-root-key',
    title: 'VS Code uses the root key "servers", not "mcpServers"',
    summary:
      'Copying a Claude/Cursor config into VS Code fails silently because the root key differs.',
    body: `Almost every client puts its MCP servers under the JSON key "mcpServers" — Claude Desktop, Claude Code, Cursor, Windsurf. VS Code is the exception: it reads the root key "servers" (and Zed reads "context_servers"). The shapes are otherwise similar enough that a wrong-key file parses as valid JSON and loads with zero servers — no error, no warning, just nothing. mcpfold folds each client its own native shape from one canonical config, so you never hand-copy between them; the fix for a drifted file is to re-fold it (\`mcpfold sync\`, or \`doctor --fix\`).`,
    related: ['config-format', 'inert-curation'],
  },
  'inert-curation': {
    id: 'inert-curation',
    title: 'A tools allow-list only filters behind the proxy shim',
    summary:
      'A curated server wired straight at its command loads every tool — the allow-list is inert.',
    body: `Native client config can enable or disable a whole server, but it cannot express "load this server, but only 3 of its 20 tools". That per-tool trimming is what saves the context-window tokens, and it needs a thin local proxy: mcpfold folds a curated server to \`mcpfold run <name>\`, which starts the real server and filters its tools/list. If a client file points a curated server directly at its real command (an old file, or a hand edit), the proxy is bypassed and every tool loads again — the \`tools\` directive silently does nothing. Re-folding through the shim (\`doctor --fix\`) restores the filtering.`,
    related: ['curation', 'no-curation'],
  },
  'mcp-remote-cve': {
    id: 'mcp-remote-cve',
    title: 'Pin the mcp-remote bridge (CVE-2025-6514)',
    summary:
      'An unpinned mcp-remote bridge can pull a version with a known remote-code-execution flaw.',
    body: `Clients that cannot reach an authenticated remote server natively bridge through the \`mcp-remote\` npx package. Versions 0.0.5–0.1.15 carry CVE-2025-6514, a remote-code-execution vulnerability, and an unpinned \`npx -y mcp-remote\` resolves to whatever is newest — or whatever an attacker has published. mcpfold pins the bridge to a known-safe version at fold time; re-folding (\`doctor --fix\`) rewrites an unpinned or vulnerable bridge to the pinned one.`,
    related: ['unpinned-latest'],
  },
  'client-json': {
    id: 'client-json',
    title: 'A client config file is not valid JSON',
    summary: 'A malformed client file cannot be read; regenerate it from the canonical config.',
    body: `A client's on-disk MCP file has become invalid JSON — usually a hand edit that dropped a comma or brace. The client silently ignores it, so servers vanish with no error. Because mcpfold treats the canonical \`mcp.config.jsonc\` as the source of truth, the safe fix is to regenerate the client file from it (\`mcpfold sync\`, or \`doctor --fix\`), rather than hand-repairing the broken JSON.`,
    related: ['config-format'],
  },
  'hardcoded-secret': {
    id: 'hardcoded-secret',
    title: 'A hardcoded token in plaintext config',
    summary: 'Store a reference, not the value — so the secret never sits in plaintext on disk.',
    body: `A literal token in a config file is a plaintext secret on disk, one \`git add .\` away from being committed and leaked. mcpfold stores a \`\${scheme:path}\` reference instead — the value lives in your env, a dotenv file, your OS keychain, Infisical, or 1Password, and is resolved in memory only at launch. \`mcpfold secret extract <server>\` moves an existing hardcoded value into a provider reference for you and rewrites the config; with the default \`shim\` strategy the value never touches a client file even after sync.`,
    related: ['secret-refs', 'shim'],
  },
  'unknown-secret-scheme': {
    id: 'unknown-secret-scheme',
    title: 'Unknown secret-provider scheme',
    summary: 'A ${scheme:path} reference names a provider mcpfold cannot resolve.',
    body: `A secret reference's scheme (the part before the colon) must name a provider mcpfold knows how to read: \`env\`, \`dotenv\`, \`infisical\`, \`keychain\`, or \`op\` (1Password). An unknown scheme like \`\${vault:...}\` can never resolve, so the server would launch without its secret. Switch it to a supported scheme, or add a provider.`,
    related: ['secret-refs'],
  },
  'unpinned-latest': {
    id: 'unpinned-latest',
    title: 'An unpinned @latest package is a supply-chain risk',
    summary:
      'Pin stdio servers to a fixed version so a launch cannot silently pull new (or malicious) code.',
    body: `\`npx -y some-server@latest\` resolves to whatever is newest at launch — so a compromised or simply broken new release runs on your machine with no review. This is the lesson of the April-2026 stdio-transport incidents. Add a \`pin\` (e.g. "pin": "1.4.2") and mcpfold rewrites @latest to that fixed version at fold time. mcpfold will not choose a version for you — pinning requires deciding which release you trust, which is a human call, so \`doctor --fix\` leaves this one to you.`,
    related: ['mcp-remote-cve'],
  },
  'deprecated-sse': {
    id: 'deprecated-sse',
    title: 'The sse transport is deprecated',
    summary: 'MCP deprecated HTTP+SSE on 2025-11-25 in favor of Streamable HTTP.',
    body: `The original HTTP+SSE transport was deprecated by the MCP spec on 2025-11-25 in favor of "streamable-http" (Streamable HTTP). An \`sse\` server still loads and folds, but you should migrate once the server supports the newer transport. This is not an automatic fix: switching a server whose endpoint does not yet speak Streamable HTTP would break it, so mcpfold surfaces it for your decision rather than rewriting it under --yes.`,
    related: ['config-format'],
  },
  'pin-integrity': {
    id: 'pin-integrity',
    title: 'A malformed integrity hash',
    summary: 'An integrity value that is not a valid SRI hash can never match a real package.',
    body: `A server's \`integrity\` field must be a Subresource-Integrity hash like \`sha512-<base64>\`. A malformed value can never match the real package, so verification would always fail (or be skipped). Fix the hash to a valid SRI form, or remove the field if you are not pinning integrity.`,
    related: ['unpinned-latest'],
  },
  'native-env-fallback': {
    id: 'native-env-fallback',
    title: 'A native-env server with a non-env secret folds via the shim',
    summary:
      'The native-env strategy only works for ${env:…}; other schemes fold through the run shim.',
    body: `The \`native-env\` secret strategy emits the client's own environment indirection, which only works for \`\${env:...}\` references. A server that opts into native-env but uses a different scheme (infisical/keychain/op/dotenv) cannot be resolved by the client, so mcpfold safely folds it through the \`mcpfold run\` shim instead — the behavior is correct, just worth knowing. Use only \`\${env:...}\` refs on native-env servers to fold shim-free, or set the server's secretStrategy to "shim" to make the choice explicit.`,
    related: ['shim', 'secret-refs'],
  },
  'curation-opportunity': {
    id: 'curation-opportunity',
    title: 'A server has recorded usage but no tools directive',
    summary:
      'mcpfold has usage data suggesting which tools you actually use — curate to trim the rest.',
    body: `The local audit trail recorded which tools of this server you have actually called, but the server has no \`tools\` allow-list, so every tool still loads into every client's context. \`mcpfold curate <server>\` shows the usage and \`mcpfold curate <server> --write\` applies the recommended allow-list — turning recorded usage into measured token savings.`,
    related: ['curation', 'no-curation'],
  },
  'no-curation': {
    id: 'no-curation',
    title: 'No tool curation configured',
    summary: 'Without a tools allow-list, every client loads every tool of every server.',
    body: `No server carries a \`tools\` directive, so the headline token-tax feature is entirely unused: each client loads the full toolset of every server on every turn. Add a \`tools\` allow-list to trim a server, or run \`mcpfold curate\` (with a recorded audit log, or the interactive picker) to get a usage-based recommendation.`,
    related: ['curation', 'curation-opportunity'],
  },
  'allowlist-staleness': {
    id: 'allowlist-staleness',
    title: 'An allow-list predates new upstream tools',
    summary:
      'A curated server shipped tools your allow-list was written before — they are invisible.',
    body: `A curated (allow-mode) server now exposes tools its allow-list was written before. Because allow-lists keep only the listed names, those new capabilities are invisible with no signal. \`mcpfold curate <server> --refresh\` re-runs the recommendation including the new tools and shows the diff before writing — it never widens an allow-list without your consent.`,
    related: ['curation'],
  },
  'audit-trail': {
    id: 'audit-trail',
    title: 'The local audit trail',
    summary: 'mcpfold records tool-call names locally by default so curation has real data.',
    body: `By default mcpfold's proxy records the names of the tools each server is called with, to a local audit log that never leaves your machine — this is what lets \`mcpfold curate\` recommend an allow-list from real usage. It records names, never arguments or results. Opt out with \`audit.enabled: false\` in the config or the \`MCPFOLD_NO_AUDIT\` environment variable.`,
    related: ['curation', 'curation-opportunity'],
  },
  'schema-error': {
    id: 'schema-error',
    title: 'The canonical config does not match the schema',
    summary: 'A field is missing or has the wrong type; fix it to match mcp.config.jsonc’s schema.',
    body: `The canonical \`mcp.config.jsonc\` failed schema validation — a field is missing, has the wrong type, or a server is internally inconsistent (e.g. a stdio server with no command, or an http server with no url). The finding names the exact path. Add \`"$schema": "https://mcpfold.com/schema/v1.json"\` to the top of your config for editor autocomplete and inline validation as you type.`,
    related: ['config-format'],
  },
  // ---- Core concepts (not tied to a single finding) --------------------------------------------
  'config-format': {
    id: 'config-format',
    title: 'The canonical mcp.config.jsonc',
    summary: 'One commented source of truth that folds out to every client’s native format.',
    body: `mcpfold keeps a single canonical \`mcp.config.jsonc\` — comments allowed, git-friendly, with secrets as references — and folds it out to each client's native format (Claude's \`mcpServers\`, VS Code's \`servers\`, Zed's \`context_servers\`, …). You edit one file; \`mcpfold sync\` renders every client deterministically. See \`docs/config-format.md\`.`,
    related: ['secret-refs', 'shim', 'curation'],
  },
  'secret-refs': {
    id: 'secret-refs',
    title: 'Secret references (${scheme:path})',
    summary: 'Configs carry references, never values; the value is resolved in memory at launch.',
    body: `A secret in a config is written as a \`\${scheme:path}\` reference — e.g. \`\${env:GITHUB_PAT}\` or \`\${keychain:github}\`. The value is never stored on disk; it is resolved in memory at launch from the named provider (env, dotenv, keychain, Infisical, 1Password). \`mcpfold secret extract\` converts an existing hardcoded value into a reference. See \`docs/secrets.md\`.`,
    related: ['hardcoded-secret', 'shim'],
  },
  shim: {
    id: 'shim',
    title: 'The run shim',
    summary:
      'mcpfold run resolves secrets and filters tools at launch, keeping both off the client file.',
    body: `The \`mcpfold run <name>\` shim is a thin launcher folded into a client file in place of the real command. At launch it resolves the server's secret references (so no value is written to the client file) and, when the server is curated, filters its tools/list (so only the allow-listed tools reach the client's context). It is the mechanism behind both secret safety and tool curation.`,
    related: ['secret-refs', 'curation', 'inert-curation'],
  },
  curation: {
    id: 'curation',
    title: 'Tool curation (the token-tax fix)',
    summary: 'Trim each server to the tools you use, cutting tool-schema tokens by up to ~80%.',
    body: `Every connected MCP server dumps its full tool schema into your agent's context on every turn, used or not. Curation trims each server to a \`tools\` allow-list, and the run shim filters the live tools/list to match — cutting tool-schema tokens dramatically (see the benchmark). \`mcpfold curate\` builds an allow-list from recorded usage or an interactive picker.`,
    related: ['no-curation', 'curation-opportunity', 'shim'],
  },
};

export interface ExplainData {
  /** The resolved entry, or null when listing topics for an unknown/omitted key. */
  entry: ExplainEntry | null;
  /** All available topic ids (always present, for discovery). */
  topics: string[];
}

export interface ExplainOptions {
  topic?: string;
}

/** True when `id` names a catalog entry — used by checks/tests to avoid orphaned `see:` pointers. */
export function hasExplain(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(EXPLAIN, id);
}

export function runExplain(options: ExplainOptions): CommandOutput<ExplainData> {
  const topics = Object.keys(EXPLAIN).sort();
  const key = options.topic;

  if (key && hasExplain(key)) {
    const entry = EXPLAIN[key]!;
    const related = entry.related?.length
      ? `\n\n${style.dim('Related:')} ${entry.related.join(', ')}`
      : '';
    return {
      data: { entry, topics },
      human: [style.bold(entry.title), style.dim(entry.summary), '', entry.body, `${related}`].join(
        '\n',
      ),
    };
  }

  // Unknown or omitted topic → list what is available (not an error for the bare `explain`).
  const list = topics.map((t) => `  ${style.bold(t)} — ${EXPLAIN[t]!.summary}`).join('\n');
  const header = key
    ? `No explanation for "${key}". Available topics:`
    : 'Explain a doctor finding or a core concept. Available topics:';
  if (key) {
    // An explicit bad key is a usage error (nonzero exit) so scripts notice a typo.
    throw new UsageError(`No explanation for "${key}".`, {
      hint: `Available topics: ${topics.join(', ')}.`,
    });
  }
  return {
    data: { entry: null, topics },
    human: `${header}\n${list}\n\nRun \`mcpfold explain <topic>\` for the full explanation.`,
  };
}
