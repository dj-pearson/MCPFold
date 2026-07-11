/**
 * Deterministic serialization (S0.8).
 *
 * The determinism invariant every adapter (S2.*) and `sync` (S3.5) MUST honor:
 *   1. Object keys are emitted in a stable order (sorted) so shuffled input renders
 *      identically — clean diffs, non-thrashing snapshots.
 *   2. Array order is PRESERVED (e.g. `args` order is semantically significant).
 *   3. Fixed indentation (2 spaces by default) and exactly one trailing newline.
 *   4. `\n` line endings regardless of host OS.
 *
 * Rendering the same canonical input twice is byte-identical. Pure — no I/O.
 */

export interface SerializeOptions {
  /** Indentation width in spaces. Default 2. */
  indent?: number;
}

/**
 * Cap on traversal depth (S22.6). A validated config nests only a few levels, so a value deeper
 * than this is pathological — bail with a clear Error instead of recursing into a RangeError. Also
 * bounds `diff`'s `semanticEqual`, which compares values through `serialize`.
 */
const MAX_SERIALIZE_DEPTH = 64;

/**
 * Recursively sort object keys (stable, ascending) while preserving array order.
 * Returns a structurally-cloned value safe to stringify deterministically.
 */
export function sortKeysDeep(value: unknown, depth = 0): unknown {
  if (depth > MAX_SERIALIZE_DEPTH) {
    throw new Error(`serialize: value nests deeper than the ${MAX_SERIALIZE_DEPTH}-level limit`);
  }
  if (Array.isArray(value)) return value.map((v) => sortKeysDeep(v, depth + 1));
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    // Object.create(null) so a `__proto__` own key can't invoke the prototype setter here (S22.3).
    const out = Object.create(null) as Record<string, unknown>;
    for (const key of Object.keys(source).sort()) {
      out[key] = sortKeysDeep(source[key], depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * Serialize a value to deterministic, byte-stable JSON text with a trailing newline.
 */
export function serialize(value: unknown, options?: SerializeOptions): string {
  const indent = options?.indent ?? 2;
  const json = JSON.stringify(sortKeysDeep(value), null, indent);
  return json.endsWith('\n') ? json : `${json}\n`;
}

/** True when two serialized texts are byte-for-byte identical. */
export function isByteIdentical(a: string, b: string): boolean {
  return a === b;
}
