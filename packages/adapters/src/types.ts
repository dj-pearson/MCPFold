import type { ClientId, Config, ResolvedServer, Scope } from '@mcpfold/core';

/**
 * The adapter interface (S2.1, spec §5) — the heart of mcpfold's client portability.
 *
 * Every client is one small module implementing {@link ClientAdapter}. Adding a client is
 * one PR with no engine changes. All the per-client format churn (root key, path, restart
 * semantics, secret strategy) is quarantined here.
 */

/** How a client wants secrets handled (spec §6, S19.4). */
export type SecretStrategy = 'inline' | 'native-input' | 'shim' | 'native-env';

/**
 * How a client natively interpolates environment variables in its config (S19.4). When an adapter
 * declares one, the `native-env` strategy can fold `${env:NAME}` references into the client's own
 * syntax and let the client resolve them at launch — no mcpfold shim process needed. `toNative`
 * renders a canonical env var name into the client's form (e.g. Cursor/VS Code `${env:NAME}`,
 * Claude Code `${NAME}`).
 */
export interface InterpolationDialect {
  toNative(name: string): string;
}

/** A native config file mcpfold would write for a client. */
export interface RenderedFile {
  /** Absolute, OS-resolved path. */
  path: string;
  /** Serialized native config (deterministic — always via core `serialize()`). */
  contents: string;
  /** Whether the client must restart to pick up the change (Claude Desktop: yes). */
  needsRestart: boolean;
}

/**
 * Injectable OS context so path resolution is testable per-platform without touching the
 * real environment. Adapters default to {@link realOsContext} in production.
 */
export interface OsContext {
  platform: NodeJS.Platform;
  home: string;
  env: NodeJS.ProcessEnv;
}

export interface ClientAdapter {
  /** The client id this adapter serves (matches the canonical profile `client`). */
  readonly id: ClientId;
  /** Default secret strategy for this client. */
  readonly secretStrategy: SecretStrategy;
  /**
   * The client's native env-interpolation dialect (S19.4). Present only for clients that resolve
   * `${env:…}`-style references themselves; enables the `native-env` strategy. Absent → the client
   * can't resolve env refs, so `native-env` falls back to the shim.
   */
  readonly interpolation?: InterpolationDialect;
  /** Whether writing this client's config requires a restart to take effect. */
  readonly needsRestart: boolean;

  /** Resolve the on-disk config path for a scope/project on a given OS. */
  resolvePath(scope: Scope, projectPath?: string, ctx?: OsContext): string;

  /** Render already-resolved (secret-ref-preserving) servers to a native file. */
  render(servers: ResolvedServer[], ctx?: OsContext): RenderedFile;

  /** Parse a native file back to a canonical partial. Powers `import` and drift detection. */
  parse(contents: string): Partial<Config>;
}
