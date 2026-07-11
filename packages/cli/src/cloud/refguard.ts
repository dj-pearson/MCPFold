import { isSecretRef, type Config, UsageError } from '@mcpfold/core';
import { TOKEN_PREFIX_ALTERNATION, TOKEN_SUFFIX } from '../util/token-prefixes.js';

/**
 * Client-side ref-only guard (S6.6) — the mirror of the server's push guard (S6.4) and the DB
 * `config_is_ref_only` CHECK (S6.2). `push` refuses to upload a config that carries any raw
 * secret value; only `${scheme:path}` references may ever leave the machine. Failing here
 * gives a clear local error instead of relying on the server to reject the payload.
 */

// S22.22: single-sourced from token-prefixes.ts so the push guard and the redactor stay aligned.
const RAW_SECRET = new RegExp(`(?:${TOKEN_PREFIX_ALTERNATION})${TOKEN_SUFFIX}`);

/** Every raw-secret-looking string value anywhere in the config, plus any literal auth.token. */
export function findRawSecrets(config: Config): string[] {
  const found: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'string') {
      if (RAW_SECRET.test(v)) found.push(v);
    } else if (Array.isArray(v)) {
      for (const item of v) walk(item);
    } else if (v && typeof v === 'object') {
      for (const value of Object.values(v)) walk(value);
    }
  };
  walk(config);
  for (const [name, server] of Object.entries(config.servers)) {
    const token = server.auth?.token;
    if (typeof token === 'string' && !isSecretRef(token) && !found.includes(token)) {
      found.push(`${name}.auth.token`);
    }
  }
  return found;
}

/** Throw a clear error if the config would upload a raw secret; no-op if it's ref-only. */
export function assertRefOnly(config: Config): void {
  const leaks = findRawSecrets(config);
  if (leaks.length > 0) {
    throw new UsageError(
      'Refusing to push: the config contains a raw secret value, not a reference.',
      {
        hint: 'Replace literal tokens with ${provider:path} references (see `mcpfold doctor`) before pushing.',
      },
    );
  }
}
