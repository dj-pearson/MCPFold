import { spawnSync } from 'node:child_process';
import { findSecretRefs, type ResolvedServer } from '@mcpfold/core';
import {
  realOsContext,
  type ClientAdapter,
  type InterpolationDialect,
  type OsContext,
  type RenderedFile,
  type SecretStrategy,
} from '@mcpfold/adapters';

/**
 * Per-adapter secret strategies (S4.6, spec §6). `sync` renders each server through the
 * strategy its adapter declares, so a raw secret value never lands in a client file:
 *
 *  - `native-input` — the adapter emits the client's own secret indirection (VS Code
 *    `${input:}` + an `inputs` array). Handled inside the adapter's render; we pass through.
 *  - `shim` — every secret-bearing server's launch is rewritten to `mcpfold run <name>`, so
 *    the token stays off disk and mcpfold resolves + injects it at launch (S4.7).
 *  - `inline` — last resort: resolve the value and write it, but ONLY if the target file is
 *    gitignored. Otherwise refuse with a clear error. Always print a loud warning.
 */

export interface StrategyOptions {
  osContext?: OsContext;
  /** Resolves secret refs → values; required for the `inline` strategy. */
  resolve?: (servers: ResolvedServer[]) => Promise<ResolvedServer[]>;
  /** Whether a path is gitignored; injectable for tests. Defaults to `git check-ignore`. */
  isGitignored?: (path: string) => boolean;
  /** Loud-warning sink for the inline / native-env strategies. */
  onWarn?: (message: string) => void;
  /** Per-profile override of the adapter's default strategy (S19.4). */
  strategyOverride?: SecretStrategy;
}

function hasSecrets(server: ResolvedServer): boolean {
  return findSecretRefs(server).length > 0;
}

/**
 * Supply-chain hygiene (S8.3): when a server declares a `pin`, rewrite `@latest` to the
 * pinned version AT FOLD TIME, so every rendered client file launches a fixed version — not
 * whatever `@latest` resolves to at run time (the April-2026 unpinned-stdio RCE lesson). The
 * shim path applies the same rewrite at launch (run.ts); this covers directly-rendered servers.
 */
function applyPinAtFold(server: ResolvedServer): ResolvedServer {
  if (!server.pin || !server.args) return server;
  return { ...server, args: server.args.map((a) => a.replace(/@latest$/, `@${server.pin}`)) };
}

/** Rewrite a server's launch to the shim: `mcpfold run <name>` (no secret on disk). */
function toShim(server: ResolvedServer): ResolvedServer {
  return {
    name: server.name,
    transport: 'stdio',
    command: 'mcpfold',
    args: ['run', server.name],
    tags: server.tags,
    client: server.client,
    scope: server.scope,
    projectPath: server.projectPath,
    tools: server.tools,
  };
}

/** Inline a resolved server's secrets so the adapter emits real values (bearer → header). */
function toInline(server: ResolvedServer): ResolvedServer {
  if (server.auth?.type === 'bearer' && server.auth.token) {
    return {
      ...server,
      auth: {
        type: 'header',
        headers: { ...(server.auth.headers ?? {}), Authorization: `Bearer ${server.auth.token}` },
      },
    };
  }
  return server;
}

/** Rewrite every `${env:NAME}` reference in a string into the client's native dialect. */
function toNativeEnv(value: string, dialect: InterpolationDialect): string {
  return value.replace(/\$\{env:([^}]+)\}/g, (_, name: string) => dialect.toNative(name));
}

/**
 * Fold a server's env-scheme refs into the client's native interpolation (S19.4), keeping the
 * REFERENCE (never a value) so the client resolves it from the process env at launch — no shim.
 * A bearer token is first moved into an `Authorization` header (where the client can interpolate
 * it), reusing the inline transform's shape but on the still-unresolved reference.
 */
function toNativeEnvServer(server: ResolvedServer, dialect: InterpolationDialect): ResolvedServer {
  const moved = toInline(server); // bearer token → Authorization header, ref preserved
  const clone: ResolvedServer = { ...moved };
  if (moved.env) {
    clone.env = Object.fromEntries(
      Object.entries(moved.env).map(([k, v]) => [k, toNativeEnv(v, dialect)]),
    );
  }
  if (moved.auth?.headers) {
    clone.auth = {
      ...moved.auth,
      headers: Object.fromEntries(
        Object.entries(moved.auth.headers).map(([k, v]) => [k, toNativeEnv(v, dialect)]),
      ),
    };
  }
  return clone;
}

function defaultGitignored(path: string): boolean {
  const result = spawnSync('git', ['check-ignore', '-q', path], { stdio: 'ignore' });
  return result.status === 0;
}

/** Thrown when the inline strategy would write a secret to a non-gitignored file. */
export class InlineNotIgnoredError extends Error {
  override readonly name = 'InlineNotIgnoredError';
}

/**
 * Render `servers` through an adapter, honoring its secret strategy. Returns the native
 * file with no raw secret for `shim`/`native-input`; for `inline` it resolves values and
 * gates on gitignore.
 */
export async function renderWithStrategy(
  adapter: ClientAdapter,
  servers: ResolvedServer[],
  options: StrategyOptions = {},
): Promise<RenderedFile> {
  const ctx = options.osContext ?? realOsContext();
  const strategy = options.strategyOverride ?? adapter.secretStrategy;
  // Pin @latest → the fixed version at fold time, before any strategy transform.
  const pinned = servers.map(applyPinAtFold);

  if (strategy === 'shim') {
    const transformed = pinned.map((s) => (hasSecrets(s) ? toShim(s) : s));
    return adapter.render(transformed, ctx);
  }

  if (strategy === 'native-input') {
    // The adapter itself emits the client's secret indirection — never a raw token.
    return adapter.render(pinned, ctx);
  }

  if (strategy === 'native-env') {
    // Fold env-scheme refs into the client's own interpolation so it resolves them itself — no
    // shim. Non-env refs (infisical/op/keychain) can't be client-resolved, and a client without a
    // declared dialect can't interpolate at all, so those fall back to the shim with an explanation.
    const dialect = adapter.interpolation;
    const transformed = pinned.map((server) => {
      const refs = findSecretRefs(server);
      if (refs.length === 0) return server;
      const allEnv = refs.every((r) => r.scheme === 'env');
      if (dialect && allEnv) return toNativeEnvServer(server, dialect);
      const why = !dialect
        ? `${adapter.id} has no native env interpolation`
        : `it uses a non-env secret (\${${refs.find((r) => r.scheme !== 'env')?.scheme}:…})`;
      options.onWarn?.(
        `native-env: server "${server.name}" falls back to the shim launcher because ${why}.`,
      );
      return toShim(server);
    });
    return adapter.render(transformed, ctx);
  }

  // inline
  if (!options.resolve) {
    throw new Error('inline strategy requires a secret resolver (providers) to be supplied.');
  }
  const resolved = (await options.resolve(pinned)).map(toInline);
  const file = adapter.render(resolved, ctx);
  const gitignored = (options.isGitignored ?? defaultGitignored)(file.path);
  if (!gitignored) {
    throw new InlineNotIgnoredError(
      `Refusing to write resolved secrets to ${file.path}: the file is not gitignored. ` +
        `Add it to .gitignore, or use a shim/native-input client instead.`,
    );
  }
  options.onWarn?.(
    `⚠ SECURITY: wrote resolved secret VALUES to ${file.path} (inline strategy). ` +
      `Ensure this file is never committed.`,
  );
  return file;
}
