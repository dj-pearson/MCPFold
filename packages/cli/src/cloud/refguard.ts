import { isSecretRef, type Config, UsageError } from '@mcpfold/core';

/**
 * Client-side ref-only guard (S6.6) — the mirror of the server's push guard (S6.4) and the DB
 * `config_is_ref_only` CHECK (S6.2). `push` refuses to upload a config that carries any raw
 * secret value; only `${scheme:path}` references may ever leave the machine. Failing here
 * gives a clear local error instead of relying on the server to reject the payload.
 */

const RAW_SECRET =
  /(ghp_[A-Za-z0-9]{20,})|(github_pat_[A-Za-z0-9_]{20,})|(sk-[A-Za-z0-9]{20,})|(xox[baprs]-[A-Za-z0-9-]{10,})|(AKIA[0-9A-Z]{16})/;

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
