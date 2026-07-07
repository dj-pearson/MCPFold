import { isMcpfoldError } from '@mcpfold/core';

/**
 * The stable, versioned `--json` output envelope (S0.10).
 *
 * Every command, when run with `--json`, prints exactly one envelope to stdout. The
 * shape is versioned (`envelopeVersion`) and snapshot-guarded so accidental changes fail
 * CI. Human and JSON output paths are kept separate (see render.ts) so prettifying human
 * output can never alter machine output.
 */
export const ENVELOPE_VERSION = 1;

export interface EnvelopeError {
  code: string;
  message: string;
  hint?: string;
}

export interface JsonEnvelope<TData = unknown> {
  envelopeVersion: number;
  ok: boolean;
  command: string;
  data: TData;
  warnings: string[];
  errors: EnvelopeError[];
}

export function successEnvelope<TData>(
  command: string,
  data: TData,
  warnings: string[] = [],
): JsonEnvelope<TData> {
  return { envelopeVersion: ENVELOPE_VERSION, ok: true, command, data, warnings, errors: [] };
}

export function errorEnvelope(
  command: string,
  errors: EnvelopeError[],
  warnings: string[] = [],
): JsonEnvelope<null> {
  return { envelopeVersion: ENVELOPE_VERSION, ok: false, command, data: null, warnings, errors };
}

/** Normalize any thrown value into the envelope's error shape (code + message + hint). */
export function toEnvelopeError(error: unknown): EnvelopeError {
  if (isMcpfoldError(error)) {
    return {
      code: error.code,
      message: error.message,
      ...(error.hint ? { hint: error.hint } : {}),
    };
  }
  if (error instanceof Error) return { code: 'INTERNAL', message: error.message };
  return { code: 'INTERNAL', message: String(error) };
}
