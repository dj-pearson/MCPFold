import { findSecretRefsInString, SecretResolutionError, type ResolvedServer } from '@mcpfold/core';
import type { SecretProvider } from './types.js';

/**
 * The fail-closed secret resolver (S4.1 + the S0.9 contract).
 *
 * Selects a provider by scheme, resolves every `${scheme:path}` reference in a server set,
 * and injects the values — memoizing within a run so the same ref is fetched once. If ANY
 * reference cannot be resolved (missing provider, missing value, provider error, or
 * timeout) the whole call rejects with a {@link SecretResolutionError} naming the provider
 * and ref, and NO server is returned partially resolved (fail closed).
 */

/** Default per-provider timeout. A hung provider aborts cleanly rather than blocking forever. */
export const DEFAULT_TIMEOUT_MS = 10_000;

export interface ResolveOptions {
  providers: SecretProvider[];
  /** Global per-provider timeout (ms); a provider's own `timeoutMs` overrides it. */
  timeoutMs?: number;
}

function buildRegistry(providers: SecretProvider[]): Map<string, SecretProvider> {
  const registry = new Map<string, SecretProvider>();
  for (const p of providers) registry.set(p.scheme, p);
  return registry;
}

async function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`timed out after ${ms}ms`));
    }, ms);
  });
  try {
    return await Promise.race([work(controller.signal), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Resolve all secret references in `servers`, returning new servers with values injected.
 * Rejects (fail closed) on the first unresolved reference.
 */
export async function resolveSecrets(
  servers: ResolvedServer[],
  options: ResolveOptions,
): Promise<ResolvedServer[]> {
  const registry = buildRegistry(options.providers);
  const defaultTimeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const memo = new Map<string, string>();

  const resolveOne = async (raw: string, scheme: string, path: string): Promise<string> => {
    const cached = memo.get(raw);
    if (cached !== undefined) return cached;

    const provider = registry.get(scheme);
    if (!provider) {
      throw new SecretResolutionError(
        `No secret provider registered for scheme "${scheme}" (reference ${raw}).`,
        {
          hint: `Register a provider for "${scheme}", or use a supported scheme (env, dotenv, infisical, keychain, op).`,
        },
      );
    }
    let value: string;
    try {
      value = await withTimeout(
        (signal) => provider.resolve(path, { signal }),
        provider.timeoutMs ?? defaultTimeout,
      );
    } catch (error) {
      throw new SecretResolutionError(
        `Failed to resolve ${raw} via provider "${scheme}": ${(error as Error).message}`,
        {
          cause: error,
          hint: `Check that "${path}" exists and the "${scheme}" provider is reachable.`,
        },
      );
    }
    memo.set(raw, value);
    return value;
  };

  /** Replace every embedded ref in a string with its resolved value. */
  const resolveString = async (input: string): Promise<string> => {
    let out = input;
    for (const ref of findSecretRefsInString(input)) {
      const value = await resolveOne(ref.raw, ref.scheme, ref.path);
      out = out.split(ref.raw).join(value);
    }
    return out;
  };

  const resolved: ResolvedServer[] = [];
  for (const server of servers) {
    const clone: ResolvedServer = { ...server };
    if (server.auth) {
      const auth = { ...server.auth };
      if (server.auth.token) auth.token = await resolveString(server.auth.token);
      if (server.auth.headers) {
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(server.auth.headers))
          headers[k] = await resolveString(v);
        auth.headers = headers;
      }
      clone.auth = auth;
    }
    if (server.env) {
      const env: Record<string, string> = {};
      for (const [k, v] of Object.entries(server.env)) env[k] = await resolveString(v);
      clone.env = env;
    }
    resolved.push(clone);
  }
  return resolved;
}
