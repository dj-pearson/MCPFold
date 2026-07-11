import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSecretRef, UsageError, type ResolvedServer } from '@mcpfold/core';
import { defaultProviders, resolveSecrets, type SecretProvider } from '@mcpfold/secrets';
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
