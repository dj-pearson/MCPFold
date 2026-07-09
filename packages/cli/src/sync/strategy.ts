import { spawnSync } from 'node:child_process';
import { findSecretRefs, type ResolvedServer } from '@mcpfold/core';
import {
  realOsContext,
  type ClientAdapter,
  type OsContext,
  type RenderedFile,
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
  /** Loud-warning sink for the inline strategy. */
  onWarn?: (message: string) => void;
  /**
   * Current on-disk contents of the target file, if any. Passed through to the adapter so
   * shared-config clients (Goose, Codex CLI, opencode) merge into — rather than clobber — the
   * unmanaged keys a user keeps alongside their MCP servers. Ignored by dedicated-file adapters.
   */
  existing?: string;
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
  // Pin @latest → the fixed version at fold time, before any strategy transform.
  const pinned = servers.map(applyPinAtFold);

  if (adapter.secretStrategy === 'shim') {
    const transformed = pinned.map((s) => (hasSecrets(s) ? toShim(s) : s));
    return adapter.render(transformed, ctx, options.existing);
  }

  if (adapter.secretStrategy === 'native-input') {
    // The adapter itself emits the client's secret indirection — never a raw token.
    return adapter.render(pinned, ctx, options.existing);
  }

  // inline
  if (!options.resolve) {
    throw new Error('inline strategy requires a secret resolver (providers) to be supplied.');
  }
  const resolved = (await options.resolve(pinned)).map(toInline);
  const file = adapter.render(resolved, ctx, options.existing);
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
