/**
 * Secret-provider interface (S4.1, spec §6) and the resolver contract (S0.9).
 *
 * A provider resolves the `path` portion of a `${scheme:path}` reference to a value. It may
 * touch env/fs/network (this package is impure by design); it is injected into the pure
 * core. Resolution is **fail-closed**: any failure aborts the whole operation — a blank or
 * partial secret is NEVER injected.
 */

export interface SecretResolveContext {
  /** Aborted when the per-provider timeout elapses; providers should honor it. */
  signal?: AbortSignal;
}

export interface SecretProvider {
  /** The scheme this provider handles, e.g. `env`, `dotenv`, `infisical`. */
  readonly scheme: string;
  /** Optional per-provider timeout override (ms). Falls back to the resolver default. */
  readonly timeoutMs?: number;
  /** Resolve the path portion of a ref to its secret value, or throw. */
  resolve(path: string, ctx?: SecretResolveContext): Promise<string>;
}
