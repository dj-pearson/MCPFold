/**
 * @mcpfold/core — the pure, I/O-free engine.
 *
 * This package owns the canonical `mcp.config.jsonc` format and all logic that
 * operates on it: the zod schema, JSONC parsing, the secret-reference grammar,
 * profile/tag/scope resolution, drift diffing, and the ClientAdapter /
 * SecretProvider interfaces. It performs no filesystem or network I/O directly —
 * every side effect is injected. See `scripts/check-core-purity.mjs`.
 */

/** Package version marker; real exports land as E1 stories are implemented. */
export const CORE_PACKAGE = '@mcpfold/core' as const;
