import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { applyEdits, modify } from 'jsonc-parser';
import { loadConfig, parseSecretRef, UsageError, type ResolvedServer } from '@mcpfold/core';
import { defaultProviders, resolveSecrets, type SecretProvider } from '@mcpfold/secrets';
import { realOsContext, type OsContext } from '@mcpfold/adapters';
import { atomicWrite } from '../io/atomic-write.js';
import { backupIfExists } from '../io/backup.js';
import { findConfigPath } from '../util/config.js';
import { checkHardcodedSecrets } from '../checks/servers.js';
import type { ExtractSecretFix } from '../checks/types.js';
import type { SecretScheme } from '../registry/map.js';
import { EXIT } from '../output/exit-codes.js';
import type { CommandOutput } from '../output/render.js';

/**
 * `mcpfold secret set|test` (S4.8). `test` resolves a reference and reports success/failure
 * with the **value always masked**; `set` stores a value for a backend that supports it
 * (dotenv → appends to `.env`). A secret value is never echoed to stdout or logs.
 */

export interface SecretTestData {
  ref: string;
  scheme: string;
  ok: boolean;
}

export interface SecretTestOptions {
  cwd: string;
  ref: string;
  providers?: SecretProvider[];
}

export async function runSecretTest(
  options: SecretTestOptions,
): Promise<CommandOutput<SecretTestData>> {
  const parsed = parseSecretRef(options.ref);
  if (!parsed) {
    throw new UsageError(`"${options.ref}" is not a valid secret reference.`, {
      hint: 'Use ${scheme:path}, e.g. ${env:GITHUB_PAT}.',
    });
  }
  const providers = options.providers ?? defaultProviders(options.cwd);
  const probe: ResolvedServer = {
    name: '__test__',
    transport: 'stdio',
    command: 'true',
    env: { PROBE: options.ref },
    tags: [],
    client: 'claude-code',
    scope: 'user',
  };

  try {
    await resolveSecrets([probe], { providers });
    return {
      data: { ref: options.ref, scheme: parsed.scheme, ok: true },
      human: `✓ Resolved ${options.ref} via "${parsed.scheme}" (value hidden).`,
    };
  } catch (error) {
    // The error message from the resolver never contains the value.
    return {
      data: { ref: options.ref, scheme: parsed.scheme, ok: false },
      human: `✖ Could not resolve ${options.ref}: ${(error as Error).message}`,
      exit: EXIT.ERROR,
    };
  }
}

export interface SecretSetData {
  scheme: string;
  path: string;
  stored: boolean;
}

export interface SecretSetOptions {
  cwd: string;
  ref: string;
  value: string;
}

export function runSecretSet(options: SecretSetOptions): CommandOutput<SecretSetData> {
  const parsed = parseSecretRef(options.ref);
  if (!parsed) {
    throw new UsageError(`"${options.ref}" is not a valid secret reference.`, {
      hint: 'Use ${scheme:path}, e.g. ${dotenv:GITHUB_PAT}.',
    });
  }

  if (parsed.scheme === 'dotenv') {
    const envPath = join(options.cwd, '.env');
    upsertDotenv(envPath, parsed.path, options.value);
    return {
      data: { scheme: parsed.scheme, path: parsed.path, stored: true },
      human: `✓ Stored ${parsed.path} in ${envPath} (value hidden). Ensure .env is gitignored.`,
    };
  }
  if (parsed.scheme === 'env') {
    return {
      data: { scheme: parsed.scheme, path: parsed.path, stored: false },
      human: `The env provider reads live process variables — export it instead:\n  export ${parsed.path}=<value>`,
    };
  }
  // keychain / op / infisical: backend-specific storage lands with those providers.
  throw new UsageError(`\`secret set\` for scheme "${parsed.scheme}" is not implemented yet.`, {
    hint: 'Supported now: dotenv (stores to .env). env/keychain/op arrive with their providers.',
  });
}

/**
 * `mcpfold secret extract <server>` (S25.3) — the guided repair for a hardcoded token. It reuses the
 * doctor detector (`checkHardcodedSecrets`) to find literal secret values in a server's `env` /
 * `auth.headers`, moves each into a provider (default `dotenv`, or `--scheme` / an interactive
 * chooser), rewrites the config value to a `${scheme:path}` reference via a comment-preserving jsonc
 * edit (re-validated), and backs the config up first. `dotenv` persists the value to `.env`; every
 * other scheme prints the exact store-it command with a `<value>` PLACEHOLDER — the raw value is
 * never echoed to stdout or logs, and stays recoverable from the config backup. Once the value is a
 * reference, `mcpfold sync` folds it through the run shim / native indirection, so it never lands in
 * any client file.
 */

export type ExtractPrompt = (question: string, fallback?: string) => Promise<string>;

const EXTRACT_SCHEMES: readonly SecretScheme[] = ['dotenv', 'env', 'keychain', 'infisical', 'op'];

export interface ExtractedRef {
  /** Where the literal lived. */
  field: ExtractSecretFix['field'];
  key: string;
  /** The reference now written into the config. */
  ref: string;
  scheme: SecretScheme;
  /** File the value was persisted to (dotenv), else null. */
  storedTo: string | null;
  /** Command the user must run to store the value (value shown as `<value>`), else null. */
  storeCommand: string | null;
}

export interface SecretExtractData {
  server: string;
  configPath: string;
  extracted: ExtractedRef[];
  wrote: boolean;
  backup: string | null;
}

export interface SecretExtractOptions {
  cwd: string;
  server: string;
  /** Target provider. Omitted → interactive prompt (default dotenv), or dotenv when non-interactive. */
  scheme?: SecretScheme;
  /** Extract only this key (default: every hardcoded secret in the server). */
  key?: string;
  dryRun?: boolean;
  /** Injectable prompt for the scheme chooser; default reads the TTY. */
  prompt?: ExtractPrompt;
  /** Injectable clock for deterministic backup names. */
  now?: Date;
  /** OS context (for the keychain store-command platform); defaults to the real environment. */
  osContext?: OsContext;
}

/** The sanitized env-style name for a secret key (matches the doctor `extract-secret` suggestion). */
function envNameFor(key: string): string {
  return key.toUpperCase().replace(/[^A-Z0-9]/g, '_');
}

function defaultExtractPrompt(): ExtractPrompt {
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

/** The exact command a user runs to store `<value>` under `path` for a non-dotenv scheme. */
function storeCommandFor(scheme: SecretScheme, path: string, platform: NodeJS.Platform): string {
  switch (scheme) {
    case 'env':
      return `export ${path}=<value>`;
    case 'keychain':
      if (platform === 'darwin')
        return `security add-generic-password -U -s mcpfold -a ${path} -w <value>`;
      if (platform === 'win32')
        return `New-StoredCredential -Target 'mcpfold:${path}' -UserName mcpfold -Password <value> -Persist LocalMachine`;
      return `secret-tool store --label=mcpfold service mcpfold account ${path}   # then type <value>`;
    case 'infisical':
      return `infisical secrets set ${path}=<value>`;
    case 'op':
      return `op item create --category=password --title='${path}' password=<value>`;
    case 'dotenv':
      return `# stored automatically in .env`;
  }
}

export async function runSecretExtract(
  options: SecretExtractOptions,
): Promise<CommandOutput<SecretExtractData>> {
  const ctx = options.osContext ?? realOsContext();
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
  const server = loaded.config.servers[options.server];
  if (!server) {
    throw new UsageError(`No server named "${options.server}" in the config.`, {
      hint: `Known servers: ${Object.keys(loaded.config.servers).join(', ') || 'none'}.`,
    });
  }

  // Reuse the doctor detector so "what counts as a hardcoded secret" has a single source of truth.
  const hits = checkHardcodedSecrets(loaded.config, configPath)
    .map((f) => f.autofix)
    .filter(
      (a): a is ExtractSecretFix => a?.kind === 'extract-secret' && a.server === options.server,
    )
    .filter((a) => !options.key || a.key === options.key);

  if (hits.length === 0) {
    const scope = options.key ? ` for key "${options.key}"` : '';
    return {
      data: { server: options.server, configPath, extracted: [], wrote: false, backup: null },
      human: `No hardcoded secrets found in "${options.server}"${scope}.`,
    };
  }

  // Pick the provider once for the whole extraction: explicit --scheme wins; otherwise prompt on a
  // TTY (default dotenv), and fall back to dotenv when non-interactive.
  let scheme = options.scheme;
  if (!scheme) {
    const prompt = options.prompt ?? (process.stdin.isTTY ? defaultExtractPrompt() : undefined);
    if (prompt) {
      const answer = await prompt(
        `Provider to move ${hits.length} secret(s) into (${EXTRACT_SCHEMES.join('/')})`,
        'dotenv',
      );
      scheme = EXTRACT_SCHEMES.includes(answer as SecretScheme)
        ? (answer as SecretScheme)
        : 'dotenv';
    }
  }
  scheme ??= 'dotenv';

  const readValue = (a: ExtractSecretFix): string => {
    const record = a.field === 'env' ? server.env : server.auth?.headers;
    return String(record?.[a.key] ?? '');
  };
  const jsonPathFor = (a: ExtractSecretFix): (string | number)[] =>
    a.field === 'env'
      ? ['servers', options.server, 'env', a.key]
      : ['servers', options.server, 'auth', 'headers', a.key];

  // Build the plan (no writes yet): a ref per hit + where its value will live.
  const warnings: string[] = [];
  const extracted: ExtractedRef[] = [];
  let newText = text;
  for (const a of hits) {
    const path = envNameFor(a.key);
    const ref = `\${${scheme}:${path}}`;
    const value = readValue(a);
    let storedTo: string | null = null;
    let storeCommand: string | null = null;

    if (scheme === 'dotenv') {
      storedTo = join(options.cwd, '.env');
      if (!options.dryRun) upsertDotenv(storedTo, path, value);
    } else {
      storeCommand = storeCommandFor(scheme, path, ctx.platform);
      warnings.push(
        `Value for "${a.key}" was NOT stored automatically — run \`${storeCommand}\` (the value is recoverable from the config backup until you do).`,
      );
    }

    // Comment-preserving structural replacement of the literal with the reference.
    newText = applyEdits(
      newText,
      modify(newText, jsonPathFor(a), ref, {
        formattingOptions: { insertSpaces: true, tabSize: 2 },
      }),
    );
    extracted.push({ field: a.field, key: a.key, ref, scheme, storedTo, storeCommand });
  }

  // Re-validate the rewritten config before we ever touch disk.
  const revalidated = loadConfig(newText);
  if (!revalidated.ok) {
    throw new UsageError(
      `Extraction would make the config invalid: ${revalidated.errors[0]?.message}`,
    );
  }

  if (options.dryRun) {
    return {
      data: { server: options.server, configPath, extracted, wrote: false, backup: null },
      human: renderExtract(options.server, configPath, extracted, { wrote: false, backup: null }),
      warnings,
    };
  }

  const backup = backupIfExists(configPath, options.now);
  atomicWrite(configPath, newText);
  return {
    data: { server: options.server, configPath, extracted, wrote: true, backup },
    human: renderExtract(options.server, configPath, extracted, { wrote: true, backup }),
    warnings,
  };
}

function renderExtract(
  server: string,
  configPath: string,
  extracted: ExtractedRef[],
  meta: { wrote: boolean; backup: string | null },
): string {
  const verb = meta.wrote ? 'Extracted' : 'Would extract';
  const lines = extracted.map((e) => {
    const where = e.storedTo ? `stored in ${e.storedTo}` : `run: ${e.storeCommand}`;
    return `  ${e.field}.${e.key} → ${e.ref}   (${where})`;
  });
  const footer: string[] = [];
  if (meta.wrote) {
    if (meta.backup) footer.push(`Config backup: ${meta.backup}`);
    footer.push(
      'Run `mcpfold sync` to fold these out — the value stays off every client file (resolved via the run shim at launch).',
    );
  } else {
    footer.push('Dry run — nothing written.');
  }
  return [
    `${verb} ${extracted.length} secret(s) from "${server}" in ${configPath}:`,
    ...lines,
    '',
    ...footer,
  ].join('\n');
}

/**
 * Safely upsert `KEY=value` into a `.env` (S22.21). Rejects a newline (which would inject extra
 * `KEY=VALUE` lines) or an `=` in the key; replaces any existing lines for the same key rather than
 * blind-appending a duplicate (so a re-set doesn't leave a stale masked value); and re-applies 0600
 * on POSIX so a pre-existing world-readable `.env` is tightened.
 */
function upsertDotenv(envPath: string, key: string, value: string): void {
  if (/[\n\r]/.test(key) || /[\n\r]/.test(value) || key.includes('=')) {
    throw new UsageError(
      'A dotenv key/value cannot contain a newline, and the key cannot contain "=".',
      { hint: 'Use a plain KEY name and a single-line value.' },
    );
  }
  const keyPrefix = `${key}=`;
  const existing = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  const lines = existing.length > 0 ? existing.replace(/\r?\n$/, '').split('\n') : [];
  // Drop every existing assignment to this key (dedupe stale duplicates), then append the fresh one.
  const kept = lines.filter((line) => !line.startsWith(keyPrefix));
  kept.push(`${key}=${value}`);
  writeFileSync(envPath, `${kept.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });
  if (process.platform !== 'win32') chmodSync(envPath, 0o600);
}
