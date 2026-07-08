/**
 * Typed error hierarchy (S0.6).
 *
 * Every error mcpfold throws is an {@link McpfoldError} carrying a stable `code` and an
 * actionable message (and often a `hint`). Codes drive the CLI exit-code contract
 * (S0.10) and let the redaction layer (S0.6 / S9.3) format failures without leaking
 * secrets. This hierarchy must exist before any error-reporting sink (Sentry, telemetry)
 * ships, so no ref path or secret value ever reaches an error tracker.
 */

export type McpfoldErrorCode =
  | 'CONFIG_PARSE'
  | 'CONFIG_VALIDATION'
  | 'UNKNOWN_PROFILE'
  | 'SECRET_RESOLUTION'
  | 'ADAPTER_RENDER'
  | 'DRIFT'
  | 'IO'
  | 'USAGE'
  | 'INTERNAL';

export interface McpfoldErrorOptions {
  hint?: string;
  cause?: unknown;
}

/** Base class for all mcpfold errors. */
export abstract class McpfoldError extends Error {
  abstract readonly code: McpfoldErrorCode;
  /** An actionable next step for the user, when one applies. */
  readonly hint?: string;

  constructor(message: string, options?: McpfoldErrorOptions) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.hint = options?.hint;
  }
}

/** JSONC syntax error while reading a canonical config. */
export class ConfigParseError extends McpfoldError {
  override readonly code = 'CONFIG_PARSE';
}

/** The config parsed but failed schema validation. */
export class ConfigValidationError extends McpfoldError {
  override readonly code = 'CONFIG_VALIDATION';
}

/** A secret reference could not be resolved by its provider. */
export class SecretResolutionError extends McpfoldError {
  override readonly code = 'SECRET_RESOLUTION';
}

/** An adapter failed to render canonical servers to a native file. */
export class AdapterRenderError extends McpfoldError {
  override readonly code = 'ADAPTER_RENDER';
}

/** On-disk client config differs from what mcpfold would write (drift). */
export class DriftError extends McpfoldError {
  override readonly code = 'DRIFT';
}

/** Filesystem/network I/O failure. */
export class IoError extends McpfoldError {
  override readonly code = 'IO';
}

/** Invalid CLI usage (bad flag, missing argument, etc.). */
export class UsageError extends McpfoldError {
  override readonly code = 'USAGE';
}

/** Type guard for the mcpfold error family. */
export function isMcpfoldError(value: unknown): value is McpfoldError {
  return value instanceof McpfoldError;
}
