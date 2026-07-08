import { loadConfig, type PositionedError } from '@mcpfold/core';
import type { Finding } from './types.js';

/** Turn canonical-config load/validation errors into doctor findings (S3.7). */
export function checkConfigValid(
  configPath: string,
  text: string,
): { findings: Finding[]; ok: boolean } {
  const result = loadConfig(text);
  if (result.ok) return { findings: [], ok: true };
  return {
    ok: false,
    findings: result.errors.map((e: PositionedError) => ({
      severity: 'error' as const,
      file: configPath,
      where: e.path ?? (e.line ? `line ${e.line}:${e.column}` : undefined),
      message: e.message,
      fix: e.hint ?? 'Fix the reported field to match the canonical schema.',
    })),
  };
}
