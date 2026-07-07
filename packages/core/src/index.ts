/**
 * @mcpfold/core — the pure, I/O-free engine.
 *
 * Owns the canonical `mcp.config.jsonc` format and every operation on it: the zod
 * schema, JSONC loading, the secret-reference grammar, and profile/tag/scope
 * resolution. Performs no filesystem or network I/O — all side effects are injected.
 */

export const CORE_PACKAGE = '@mcpfold/core' as const;

// Schema (S1.1)
export {
  AuthSchema,
  CLIENT_IDS,
  ConfigSchema,
  ProfileSchema,
  SCOPES,
  SECRET_REF_RE,
  SECRET_SCHEMES,
  SecretRef,
  ServerSchema,
  ToolsSchema,
  TRANSPORTS,
} from './schema.js';

// Inferred types (S1.1, S1.4)
export type {
  AuthConfig,
  ClientId,
  Config,
  ProfileConfig,
  ResolvedServer,
  Scope,
  ServerConfig,
  ToolsDirective,
  Transport,
} from './types.js';

// JSONC loader (S1.2)
export {
  loadConfig,
  loadConfigOrThrow,
  offsetToLineCol,
  type ConfigErrorCode,
  type LoadResult,
  type PositionedError,
} from './load.js';

// Secret-reference grammar (S1.3)
export {
  findSecretRefs,
  findSecretRefsInString,
  isSecretRef,
  parseSecretRef,
  type LocatedSecretRef,
  type ParsedSecretRef,
  type SecretScheme,
} from './secret-ref.js';

// Resolution engine (S1.4)
export {
  resolveAll,
  resolveProfile,
  resolveProfileWithDiagnostics,
  UnknownProfileError,
  type ResolveDiagnostics,
} from './resolve.js';
