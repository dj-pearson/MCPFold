import { spawnSync } from 'node:child_process';
import { findSecretRefs, type ResolvedServer, type SecretStrategy } from '@mcpfold/core';
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
  /**
   * Per-profile secret-strategy override (S19.4). A server's own `secretStrategy` still wins over
   * this; both fall back to the adapter's default. Only meaningful for shim-default adapters (the
   * `native-env` opt-in) — `native-input`/`inline` adapters keep their intrinsic behavior.
   */
  strategyOverride?: SecretStrategy;
  /**
   * Absolute directory containing the canonical config. When set, the shim embeds it
   * (`mcpfold run <name> --cwd <dir>`): GUI clients (Claude Desktop, etc.) launch MCP servers
   * from an arbitrary working directory, and `mcpfold run` resolves the config from its cwd —
   * without the flag the shimmed server dies with "No mcp.config.jsonc found" even though
   * sync succeeded. Sync/diff always pass it; omitting it keeps the bare legacy shim.
   * Project-scope folds never embed it (see toShim) — those files are committed and must
   * stay machine-portable.
   */
  configDir?: string;
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

/**
 * Rewrite a server's launch to the shim: `mcpfold run <name> --cwd <configDir>` (no secret on
 * disk). `--cwd` pins the canonical config's location so the shim works from any launch cwd.
 *
 * Scope rule: only USER-scope folds embed the (absolute, machine-specific) `--cwd`. Project-scope
 * client files live inside the repo and are often committed (the S12.1 team workflow gates them
 * with `sync --check` in CI), so they must stay machine-portable — and their client launches
 * servers with the workspace as cwd, where the bare shim already finds the config.
 */
function toShim(server: ResolvedServer, configDir?: string): ResolvedServer {
  const embedCwd = server.scope === 'project' ? undefined : configDir;
  return {
    name: server.name,
    transport: 'stdio',
    command: 'mcpfold',
    args: embedCwd ? ['run', server.name, '--cwd', embedCwd] : ['run', server.name],
    tags: server.tags,
    client: server.client,
    scope: server.scope,
    projectPath: server.projectPath,
    tools: server.tools,
  };
}

/** Rewrite every `${env:NAME}` occurrence in a string into the client's own dialect (S19.4). */
function rewriteEnvRefs(value: string, dialect: (name: string) => string): string {
  return value.replace(/\$\{env:([^}]+)\}/g, (_, name: string) => dialect(name.trim()));
}

/**
 * `native-env` transform (S19.4): rewrite a server's env-scheme secret refs into the client's own
 * interpolation dialect, so the CLIENT resolves them — no wrapper process, and the value is never
 * written (only the placeholder name). A bearer token becomes an `Authorization` header carrying the
 * native placeholder (the client interpolates it at launch). Only called when every ref is env-scheme.
 */
function toNativeEnv(server: ResolvedServer, dialect: (name: string) => string): ResolvedServer {
  const out: ResolvedServer = { ...server };
  if (server.env) {
    out.env = Object.fromEntries(
      Object.entries(server.env).map(([k, v]) => [k, rewriteEnvRefs(v, dialect)]),
    );
  }
  if (server.auth?.type === 'bearer' && server.auth.token) {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(server.auth.headers ?? {}))
      headers[k] = rewriteEnvRefs(v, dialect);
    headers.Authorization = `Bearer ${rewriteEnvRefs(server.auth.token, dialect)}`;
    out.auth = { type: 'header', headers };
  } else if (server.auth?.headers) {
    out.auth = {
      ...server.auth,
      headers: Object.fromEntries(
        Object.entries(server.auth.headers).map(([k, v]) => [k, rewriteEnvRefs(v, dialect)]),
      ),
    };
  }
  return out;
}

/**
 * The effective per-server strategy for a shim-default adapter (S19.4): the server's own override,
 * else the profile override, else `shim`. `native-env` only applies when the adapter declares a
 * dialect AND every secret ref is env-scheme; otherwise it falls back to `shim` (doctor explains why).
 */
function transformSecret(
  server: ResolvedServer,
  adapter: ClientAdapter,
  profileOverride: SecretStrategy | undefined,
  configDir: string | undefined,
): ResolvedServer {
  const refs = findSecretRefs(server);
  if (refs.length === 0) return server;
  const want = server.secretStrategy ?? profileOverride ?? adapter.secretStrategy;
  if (want === 'native-env' && adapter.envInterpolation && refs.every((r) => r.scheme === 'env')) {
    return toNativeEnv(server, adapter.envInterpolation);
  }
  return toShim(server, configDir);
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

  if (adapter.secretStrategy === 'native-input') {
    // The adapter itself emits the client's secret indirection — never a raw token. Intrinsic; not
    // user-overridable (its own indirection is already value-free).
    return adapter.render(pinned, ctx, options.existing);
  }

  if (adapter.secretStrategy !== 'inline') {
    // Shim-default adapters (the vast majority). Each secret-bearing server folds via the shim, or —
    // when the profile/server opts into `native-env` and the adapter has a dialect — via the client's
    // own env interpolation. Non-env schemes silently fall back to the shim (safe by construction).
    const transformed = pinned.map((s) =>
      transformSecret(s, adapter, options.strategyOverride, options.configDir),
    );
    return adapter.render(transformed, ctx, options.existing);
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
