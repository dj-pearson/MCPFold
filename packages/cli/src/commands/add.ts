import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { applyEdits, modify } from 'jsonc-parser';
import { isSecretRef, loadConfig, UsageError, type ServerConfig } from '@mcpfold/core';
import type { OsContext } from '@mcpfold/adapters';
import { findConfigPath } from '../util/config.js';
import { atomicWrite } from '../io/atomic-write.js';
import { enforceServerPolicy } from '../policy/discover.js';
import type { CommandOutput } from '../output/render.js';

/**
 * `mcpfold add <name>` (S3.4) — guided/scripted server entry. A URL creates an http server;
 * an npm spec creates a stdio `npx` server (optionally pinned). Tokens are stored ONLY as
 * `${provider:path}` references — never a raw value. The new server is inserted into the
 * canonical file with jsonc-parser's structural edit, which preserves surrounding comments,
 * and the result is re-validated.
 */

export type Prompt = (question: string, fallback?: string) => Promise<string>;

export interface AddOptions {
  cwd: string;
  name: string;
  url?: string;
  package?: string;
  transport?: 'http' | 'sse' | 'stdio';
  pin?: string;
  tags?: string[];
  tokenRef?: string;
  authType?: 'bearer' | 'header' | 'none';
  dryRun?: boolean;
  /** Injectable prompt for the interactive path; default reads from the TTY. */
  prompt?: Prompt;
  /** OS context for org-policy discovery (S18.3). Injectable for tests. */
  osContext?: OsContext;
}

export interface AddData {
  name: string;
  server: ServerConfig;
  configPath: string;
  wrote: boolean;
}

function defaultPrompt(): Prompt {
  return async (question, fallback) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const suffix = fallback ? ` [${fallback}]` : '';
      const answer = (await rl.question(`${question}${suffix}: `)).trim();
      return answer || fallback || '';
    } finally {
      rl.close();
    }
  };
}

export async function runAdd(options: AddOptions): Promise<CommandOutput<AddData>> {
  const configPath = findConfigPath(options.cwd);
  if (!configPath) {
    throw new UsageError(`No mcp.config.jsonc found in ${options.cwd}.`, {
      hint: 'Run `mcpfold init` first.',
    });
  }
  const text = readFileSync(configPath, 'utf8');
  const loaded = loadConfig(text);
  if (!loaded.ok) {
    throw new UsageError(`Config at ${configPath} is invalid; run \`mcpfold doctor\` first.`);
  }
  if (loaded.config.servers[options.name]) {
    throw new UsageError(`A server named "${options.name}" already exists.`, {
      hint: 'Pick a different name or edit the config directly.',
    });
  }

  const prompt = options.prompt ?? (needsPrompting(options) ? defaultPrompt() : undefined);

  // Decide transport + source.
  let url = options.url;
  let pkg = options.package;
  if (!url && !pkg && prompt) {
    const answer = await prompt('Server URL (blank for an npm/stdio server)');
    if (answer) url = answer;
    else pkg = await prompt('npm package spec (e.g. @playwright/mcp@latest)');
  }
  if (!url && !pkg) {
    throw new UsageError('Provide --url <url> or --package <spec> (or run interactively).');
  }

  const tags = options.tags ?? [];
  let server: ServerConfig;

  if (url) {
    const transport = options.transport === 'sse' ? 'sse' : 'http';
    server = { transport, url, tags };
    let tokenRef = options.tokenRef;
    if (!tokenRef && prompt) {
      const answer = await prompt('Auth token reference (${scheme:path}, blank for none)');
      tokenRef = answer || undefined;
    }
    if (tokenRef) {
      if (!isSecretRef(tokenRef)) {
        throw new UsageError(`"${tokenRef}" is not a secret reference.`, {
          hint: 'Use ${scheme:path} (e.g. ${env:GITHUB_PAT}) — mcpfold never stores a raw token.',
        });
      }
      server.auth = { type: options.authType ?? 'bearer', token: tokenRef };
    }
  } else {
    server = { transport: 'stdio', command: 'npx', args: ['-y', pkg!], tags };
    const pin = options.pin;
    if (pin) server.pin = pin;
  }

  // Org policy (S18.3): refuse to add a server the org policy denies, before it ever hits disk.
  enforceServerPolicy(options.name, server, options.cwd, options.osContext);

  // Structural insert that preserves surrounding comments.
  const edits = modify(text, ['servers', options.name], server, {
    formattingOptions: { insertSpaces: true, tabSize: 2 },
  });
  const newText = applyEdits(text, edits);

  // Re-validate the result before writing.
  const revalidated = loadConfig(newText);
  if (!revalidated.ok) {
    throw new UsageError(
      `Adding "${options.name}" would make the config invalid: ${revalidated.errors[0]?.message}`,
    );
  }

  if (options.dryRun) {
    return {
      data: { name: options.name, server, configPath, wrote: false },
      human: `Would add "${options.name}" to ${configPath}:\n\n${newText}`,
    };
  }

  atomicWrite(configPath, newText);
  return {
    data: { name: options.name, server, configPath, wrote: true },
    human: `Added "${options.name}" (${server.transport}) to ${configPath}. Run \`mcpfold sync\` to fold it out.`,
  };
}

function needsPrompting(options: AddOptions): boolean {
  return !options.url && !options.package;
}
