import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { findSecretRefs, isSecretRef, type Config } from '@mcpfold/core';
import type { SecretProvider } from '@mcpfold/secrets';

/**
 * The suite-wide secret-leak harness (S9.1) — the single most important control.
 *
 * A known SENTINEL value is injected via a fake provider; the flows under test are run;
 * then every artifact (rendered files, backups, temp dirs, captured stdout/stderr) is
 * scanned for the sentinel. It must appear in ZERO artifacts except a legitimately
 * gitignored `inline` target. Resolution is memory-only — no value is ever cached to disk.
 */

/** A distinctive, token-shaped sentinel (letters + digits) that would never occur naturally. */
export const SENTINEL = 'SENTINELtoken0xDEADBEEF1337cafeXYZ';

/** The env var name a config references (`${env:SENTINEL_VAR}`) to pull the sentinel. */
export const SENTINEL_ENV_VAR = 'MCPFOLD_LEAK_SENTINEL';

/** A provider (any scheme) that always returns the sentinel — for injecting it into flows. */
export function sentinelProvider(scheme: string): SecretProvider {
  return { scheme, resolve: async () => SENTINEL };
}

/** Recursively list every file under `dir` whose contents contain `needle`. */
export function scanForSentinel(dir: string, needle: string = SENTINEL): string[] {
  const hits: string[] = [];
  const walk = (d: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = join(d, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(full);
      } else {
        try {
          if (readFileSync(full, 'utf8').includes(needle)) hits.push(full);
        } catch {
          /* binary / unreadable — skip */
        }
      }
    }
  };
  walk(dir);
  return hits;
}

export interface RawSecretLeak {
  server: string;
  location: string;
  value: string;
}

/**
 * Client-side push guard (S9.1, mirrors the server guard in S6.4): a config that is about to
 * be pushed must carry secret REFERENCES only — never a resolved/raw value in a secret
 * position. Returns every offending position; {@link assertRefOnlyForPush} throws on any.
 */
export function findRawSecretsForPush(config: Config): RawSecretLeak[] {
  const leaks: RawSecretLeak[] = [];
  const looksSecret = (value: string): boolean =>
    !isSecretRef(value) &&
    /(?=[A-Za-z0-9_-]*[A-Za-z])(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{16,}/.test(value);

  for (const [name, server] of Object.entries(config.servers)) {
    // auth.token must always be a reference (schema enforces the pattern, but guard anyway).
    if (server.auth?.token && !isSecretRef(server.auth.token)) {
      leaks.push({ server: name, location: 'auth.token', value: server.auth.token });
    }
    for (const [k, v] of Object.entries(server.auth?.headers ?? {})) {
      if (looksSecret(v)) leaks.push({ server: name, location: `auth.headers.${k}`, value: v });
    }
    for (const [k, v] of Object.entries(server.env ?? {})) {
      if (looksSecret(v)) leaks.push({ server: name, location: `env.${k}`, value: v });
    }
  }
  return leaks;
}

export function assertRefOnlyForPush(config: Config): void {
  const leaks = findRawSecretsForPush(config);
  if (leaks.length > 0) {
    const where = leaks.map((l) => `${l.server}.${l.location}`).join(', ');
    throw new Error(
      `Refusing to push: config contains raw secret value(s) in a secret position (${where}). ` +
        `Replace with a \${scheme:path} reference — mcpfold never syncs secret values.`,
    );
  }
}

/** True if a server references any secret (used to assert flows that should resolve do). */
export function referencesSecrets(config: Config): boolean {
  return Object.values(config.servers).some((s) => findSecretRefs(s).length > 0);
}
