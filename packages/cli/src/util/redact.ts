import { isSecretRef, type Config } from '@mcpfold/core';

/**
 * Redaction module (S0.6) — shared by the diagnostic bundle, `--debug` logs (S0.6),
 * CLI output (S9.3), and any future telemetry/Sentry sink (S8.3). Nothing that leaves the
 * machine may contain a secret VALUE or a provider ref PATH.
 *
 * Two redaction concerns:
 *   1. Secret references `${scheme:path}` — keep the scheme (useful signal), redact the
 *      path: `${infisical:dev/mcp/GITHUB_PAT}` → `${infisical:***}`.
 *   2. Registered sentinel values (e.g. a resolved token) — scrubbed verbatim anywhere
 *      they appear, so a leaked value never survives even outside a ref.
 */

const REF_RE = /\$\{([a-z0-9_-]+):[^}]+\}/g;
const REDACTED = '***';

/** Redact the path portion of every secret reference embedded in a string. */
export function redactRefPaths(input: string): string {
  return input.replace(REF_RE, (_match, scheme: string) => `\${${scheme}:${REDACTED}}`);
}

/**
 * Mask token-shaped strings (S9.3): known provider prefixes and high-entropy blobs. This
 * catches a resolved/inlined secret in output even when it wasn't registered as a sentinel.
 * References (`${scheme:path}`) are left alone — they are handled by {@link redactRefPaths}
 * and are not secret values.
 */
const KNOWN_TOKEN_RE =
  /\b(?:gh[pousr]_|sk-|xox[baprs]-|AKIA|ya29\.|glpat-|pk_live_|rk_live_)[A-Za-z0-9_\-./]{6,}/g;
// A long URL-safe run that contains BOTH a letter and a digit (avoids masking prose, plain
// URLs, and `KEY=` separators — the class excludes `=`/`+`/`/` so it stops at delimiters).
const HIGH_ENTROPY_RE =
  /(?<![${:\w])(?=[A-Za-z0-9_-]*[A-Za-z])(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{24,}(?![A-Za-z0-9_-])/g;

export function maskTokens(input: string): string {
  return input.replace(KNOWN_TOKEN_RE, REDACTED).replace(HIGH_ENTROPY_RE, REDACTED);
}

/**
 * A stateful redactor that also scrubs registered sentinel secret values. Reused across a
 * process so any resolved secret registered once is scrubbed from all later output.
 */
export class Redactor {
  private readonly sentinels: string[] = [];

  /** Register a concrete secret value to scrub verbatim from all future output. */
  register(secret: string | undefined): void {
    if (secret && secret.length >= 4 && !this.sentinels.includes(secret)) {
      this.sentinels.push(secret);
    }
  }

  /** Redact ref paths, any registered sentinel, and token-shaped strings from a string. */
  string(input: string): string {
    let out = redactRefPaths(input);
    for (const secret of this.sentinels) {
      out = out.split(secret).join(REDACTED);
    }
    return maskTokens(out);
  }

  /** Deep-redact every string in an arbitrary JSON-serializable value. */
  deep<T>(value: T): T {
    if (typeof value === 'string') return this.string(value) as unknown as T;
    if (Array.isArray(value)) return value.map((v) => this.deep(v)) as unknown as T;
    if (value !== null && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) out[k] = this.deep(v);
      return out as T;
    }
    return value;
  }
}

/** A process-wide default redactor for convenience (debug logging, bundle). */
export const defaultRedactor = new Redactor();

/**
 * Produce a redaction-safe clone of a config for a diagnostic bundle: every secret-bearing
 * field (`auth.token`, `auth.headers.*`, `env.*`) is fully replaced — a ref keeps its
 * scheme, a literal is blanked — and all remaining strings run through ref-path redaction.
 */
export function redactConfig(config: Config, redactor: Redactor = new Redactor()): unknown {
  const redactField = (value: string): string =>
    isSecretRef(value) ? redactRefPaths(value) : REDACTED;

  const servers: Record<string, unknown> = {};
  for (const [name, server] of Object.entries(config.servers)) {
    const clone: Record<string, unknown> = { ...server };
    if (server.auth) {
      const auth: Record<string, unknown> = { ...server.auth };
      if (server.auth.token) auth.token = redactField(server.auth.token);
      if (server.auth.headers) {
        auth.headers = Object.fromEntries(
          Object.entries(server.auth.headers).map(([k, v]) => [k, redactField(v)]),
        );
      }
      clone.auth = auth;
    }
    if (server.env) {
      clone.env = Object.fromEntries(
        Object.entries(server.env).map(([k, v]) => [k, redactField(v)]),
      );
    }
    servers[name] = clone;
  }

  // Final pass scrubs any registered sentinels and stray ref paths elsewhere.
  return redactor.deep({ version: config.version, servers, profiles: config.profiles });
}
