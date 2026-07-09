import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { applyEdits, modify } from 'jsonc-parser';
import { isSecretRef, loadConfig, UsageError, type ServerConfig } from '@mcpfold/core';
import { realOsContext, type OsContext } from '@mcpfold/adapters';
import { findConfigPath } from '../util/config.js';
import { checkServer, describeViolation, loadPolicy } from '../util/policy.js';
import { mapRegistryServer, type SecretScheme } from '../registry/map.js';
import { httpRegistryClient, type RegistryClient } from '../registry/client.js';
import { atomicWrite } from '../io/atomic-write.js';
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
  /** Resolve `<name>` from the official MCP registry into a pinned, ref-only entry (S17.7). */
  fromRegistry?: boolean;
  /** Secret scheme for refs synthesized from registry `isSecret` env vars (default prompts, else env). */
  secretScheme?: SecretScheme;
  /** Local config key to store a registry server under (defaults to the name's last path segment). */
  as?: string;
  /** Injectable registry client (S17.7); defaults to the real HTTP client. */
  registry?: RegistryClient;
  /** Injectable prompt for the interactive path; default reads from the TTY. */
  prompt?: Prompt;
  /** OS context for org-policy discovery (S18.3); defaults to the real environment. */
  osContext?: OsContext;
}

/** A clean local server key from a reverse-DNS registry name (`ns/pkg` → `pkg`, `a.b.c` → `c`). */
export function deriveLocalName(registryName: string): string {
  const tail = registryName.includes('/')
    ? registryName.slice(registryName.lastIndexOf('/') + 1)
    : registryName.slice(registryName.lastIndexOf('.') + 1);
  return tail.replace(/[^A-Za-z0-9._-]/g, '-') || registryName;
}

const SECRET_SCHEME_VALUES: readonly SecretScheme[] = [
  'env',
  'dotenv',
  'infisical',
  'keychain',
  'op',
];

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
  // The config key: for a registry add, derive a clean local name from the reverse-DNS name.
  const configKey = options.fromRegistry
    ? (options.as ?? deriveLocalName(options.name))
    : options.name;
  if (loaded.config.servers[configKey]) {
    throw new UsageError(`A server named "${configKey}" already exists.`, {
      hint: 'Pick a different name (--as <name>) or edit the config directly.',
    });
  }

  const prompt = options.prompt ?? (needsPrompting(options) ? defaultPrompt() : undefined);
  const tags = options.tags ?? [];
  let server: ServerConfig;

  if (options.fromRegistry) {
    // S17.7: resolve the registry listing into a pinned, integrity-hashed, ref-only server.
    const client = options.registry ?? httpRegistryClient();
    let scheme = options.secretScheme;
    if (!scheme && prompt) {
      const answer = await prompt(
        `Secret scheme for any secret env vars (${SECRET_SCHEME_VALUES.join('/')})`,
        'env',
      );
      scheme = SECRET_SCHEME_VALUES.includes(answer as SecretScheme)
        ? (answer as SecretScheme)
        : 'env';
    }
    const regServer = await client.getByName(options.name);
    server = mapRegistryServer(regServer, { secretScheme: scheme ?? 'env' });
    server.tags = tags;
  } else {
    // Manual add: decide transport + source from flags or interactive prompts.
    let url = options.url;
    let pkg = options.package;
    if (!url && !pkg && prompt) {
      const answer = await prompt('Server URL (blank for an npm/stdio server)');
      if (answer) url = answer;
      else pkg = await prompt('npm package spec (e.g. @playwright/mcp@latest)');
    }
    if (!url && !pkg) {
      throw new UsageError('Provide --url <url>, --package <spec>, or --from-registry <name>.');
    }
    if (url) {
      // S17.5: the canonical remote transport is `streamable-http` (the spec's HTTP transport).
      const transport = options.transport === 'sse' ? 'sse' : 'streamable-http';
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
      if (options.pin) server.pin = options.pin;
    }
  }

  // Org policy (S18.3): refuse to add a server the org policy blocks — before it ever enters config.
  const violation = checkServer(
    loadPolicy(options.cwd, options.osContext ?? realOsContext()),
    configKey,
    server,
  );
  if (violation) {
    throw new UsageError(`Org policy blocks adding "${configKey}": ${violation.decision.reason}.`, {
      hint: `${describeViolation(violation)}. Contact your platform team.`,
    });
  }

  // Structural insert that preserves surrounding comments.
  const edits = modify(text, ['servers', configKey], server, {
    formattingOptions: { insertSpaces: true, tabSize: 2 },
  });
  const newText = applyEdits(text, edits);

  // Re-validate the result before writing.
  const revalidated = loadConfig(newText);
  if (!revalidated.ok) {
    throw new UsageError(
      `Adding "${configKey}" would make the config invalid: ${revalidated.errors[0]?.message}`,
    );
  }

  if (options.dryRun) {
    return {
      data: { name: configKey, server, configPath, wrote: false },
      human: `Would add "${configKey}" to ${configPath}:\n\n${newText}`,
    };
  }

  atomicWrite(configPath, newText);
  return {
    data: { name: configKey, server, configPath, wrote: true },
    human: `Added "${configKey}" (${server.transport}) to ${configPath}. Run \`mcpfold sync\` to fold it out.`,
  };
}

function needsPrompting(options: AddOptions): boolean {
  // A registry add only needs input to pick a secret scheme (skipped when --secret-scheme is set).
  if (options.fromRegistry) return !options.secretScheme;
  return !options.url && !options.package;
}
