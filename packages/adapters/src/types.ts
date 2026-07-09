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

/**
 * How a client names the remote-endpoint field in its native config, or `shim` when it can't
 * take a remote entry at all and must be bridged with `mcp-remote` (S17.2):
 *   - `url`      — a bare `url` alongside optional `headers` (Cursor, Zed, Cline, …)
 *   - `type+url` — an explicit `type: 'http'|'sse'` next to `url` (Claude Code, VS Code)
 *   - `httpUrl`  — streamable HTTP under `httpUrl`, SSE under `url` (Gemini CLI)
 *   - `shim`     — no native remote support; folds to a pinned `npx mcp-remote` stdio launch
 */
export type RemoteFieldShape = 'url' | 'type+url' | 'httpUrl' | 'shim';

/**
 * A client's remote-transport capability (S17.2) — the per-adapter contract that decides whether
 * a remote server folds to a native entry or is bridged with the pinned `mcp-remote` shim.
 *
 * `mcp-remote` is explicitly transitional ("as soon as your client supports remote, authorized
 * servers, you can remove it"), so mcpfold folds natively wherever a client can and shims only the
 * residue. The shim is needed when a server is remote AND either the client can't call remotes at
 * all (`!nativeHttp`) or the server is authenticated and the client can't attach auth to a native
 * remote entry (`authed && !nativeOauth`).
 */
export interface RemoteCapability {
  /** Can the client reach an http/sse remote from its own config (no `mcp-remote` bridge)? */
  readonly nativeHttp: boolean;
  /** Can it authenticate a native remote entry itself (auth headers / OAuth), not via the bridge? */
  readonly nativeOauth: boolean;
  /** The field shape the client uses for remote entries (or `shim` when it has none). */
  readonly fieldShape: RemoteFieldShape;
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
  /** Whether writing this client's config requires a restart to take effect. */
  readonly needsRestart: boolean;
  /** Remote-transport capability (S17.2) — drives native-entry vs `mcp-remote` shim folding. */
  readonly remote: RemoteCapability;

  /** Resolve the on-disk config path for a scope/project on a given OS. */
  resolvePath(scope: Scope, projectPath?: string, ctx?: OsContext): string;

  /**
   * Render already-resolved (secret-ref-preserving) servers to a native file.
   *
   * `existing` is the current on-disk contents of the target file, when present. Adapters that
   * write a **dedicated** file (Cursor, Claude, …) ignore it and fully replace. Adapters that
   * write into a file the client **shares with non-MCP settings** (Goose's `config.yaml`, Codex's
   * `config.toml`, opencode's `opencode.json`) merge their managed servers into `existing`,
   * preserving every unmanaged key (and comments, where the format allows).
   */
  render(servers: ResolvedServer[], ctx?: OsContext, existing?: string): RenderedFile;

  /** Parse a native file back to a canonical partial. Powers `import` and drift detection. */
  parse(contents: string): Partial<Config>;
}
