import type { ClientId, Config, ResolvedServer, Scope } from '@mcpfold/core';

/**
 * The adapter interface (S2.1, spec §5) — the heart of mcpfold's client portability.
 *
 * Every client is one small module implementing {@link ClientAdapter}. Adding a client is
 * one PR with no engine changes. All the per-client format churn (root key, path, restart
 * semantics, secret strategy) is quarantined here.
 */

/** How a client wants secrets handled (spec §6). */
export type SecretStrategy = 'inline' | 'native-input' | 'shim';

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
  /** Whether writing this client's config requires a restart to take effect. */
  readonly needsRestart: boolean;

  /** Resolve the on-disk config path for a scope/project on a given OS. */
  resolvePath(scope: Scope, projectPath?: string, ctx?: OsContext): string;

  /** Render already-resolved (secret-ref-preserving) servers to a native file. */
  render(servers: ResolvedServer[], ctx?: OsContext): RenderedFile;

  /** Parse a native file back to a canonical partial. Powers `import` and drift detection. */
  parse(contents: string): Partial<Config>;
}
