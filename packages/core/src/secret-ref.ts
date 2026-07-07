import { SECRET_SCHEMES } from './schema.js';
import type { ServerConfig } from './types.js';

/**
 * Secret-reference grammar (S1.3). Pure parsing only — resolution is E4.
 *
 * Grammar: `${scheme:path}` where `scheme` is `[a-z0-9_-]+` and `path` is
 * provider-specific (e.g. `dev/mcp/GITHUB_PAT`). An unknown scheme is NOT a parse
 * error — it parses with `known: false` so `doctor` can warn without crashing.
 */

export type SecretScheme = (typeof SECRET_SCHEMES)[number];

export interface ParsedSecretRef {
  scheme: string;
  path: string;
  /** Whether `scheme` is one of the schemes the resolver knows about. */
  known: boolean;
  /** The exact matched text, e.g. `${env:X}`. */
  raw: string;
}

/** A ref plus where in a server it was found (JSON-path-ish, e.g. `auth.token`). */
export interface LocatedSecretRef extends ParsedSecretRef {
  location: string;
}

/** Whole-string ref: the ENTIRE input must be a single `${scheme:path}`. */
const WHOLE_REF_RE = /^\$\{([a-z0-9_-]+):(.+)\}$/;

/** Embedded refs: find every `${scheme:path}` occurrence anywhere in a string. */
const EMBEDDED_REF_RE = /\$\{([a-z0-9_-]+):([^}]+)\}/g;

function isKnownScheme(scheme: string): scheme is SecretScheme {
  return (SECRET_SCHEMES as readonly string[]).includes(scheme);
}

/**
 * Parse a string that is EXACTLY one secret reference.
 *
 * Returns `null` for non-refs, including strings that merely *contain* a ref
 * (e.g. `"Bearer ${env:X}"` → null). Use {@link findSecretRefsInString} to
 * enumerate embedded refs. This split is deliberate and documented: canonical
 * `auth.token` is always a whole-string ref, whereas header/env values may embed one.
 */
export function parseSecretRef(input: string): ParsedSecretRef | null {
  const m = WHOLE_REF_RE.exec(input);
  if (!m) return null;
  const scheme = m[1]!;
  const path = m[2]!;
  return { scheme, path, known: isKnownScheme(scheme), raw: input };
}

/** Find every `${scheme:path}` embedded anywhere in a string (handles `"Bearer ${env:X}"`). */
export function findSecretRefsInString(input: string): ParsedSecretRef[] {
  const out: ParsedSecretRef[] = [];
  EMBEDDED_REF_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EMBEDDED_REF_RE.exec(input)) !== null) {
    const scheme = m[1]!;
    const path = m[2]!;
    out.push({ scheme, path, known: isKnownScheme(scheme), raw: m[0] });
  }
  return out;
}

/** True if the string is exactly one secret reference. */
export function isSecretRef(input: string): boolean {
  return WHOLE_REF_RE.test(input);
}

/**
 * Enumerate every secret reference in a server's `auth.token`, `auth.headers`, and `env`.
 * Used by the resolver (E4) and `doctor` (E3). Embedded refs in header/env values are
 * included with their location.
 */
export function findSecretRefs(server: ServerConfig): LocatedSecretRef[] {
  const out: LocatedSecretRef[] = [];

  const collect = (value: string, location: string): void => {
    for (const ref of findSecretRefsInString(value)) {
      out.push({ ...ref, location });
    }
  };

  if (server.auth?.token) collect(server.auth.token, 'auth.token');
  if (server.auth?.headers) {
    for (const [key, value] of Object.entries(server.auth.headers)) {
      collect(value, `auth.headers.${key}`);
    }
  }
  if (server.env) {
    for (const [key, value] of Object.entries(server.env)) {
      collect(value, `env.${key}`);
    }
  }
  return out;
}
