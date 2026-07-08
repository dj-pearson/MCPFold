import { isMcpfoldError } from '@mcpfold/core';

/**
 * The exit-code contract (S0.10). Applied uniformly by every command so CI pipelines
 * and scripts can branch on the result:
 *
 *   0  SUCCESS  — clean success, no actionable difference.
 *   1  DIFF     — an actionable difference (e.g. drift from `diff` / `sync --check`).
 *   2  ERROR    — an error or misuse (bad config, unknown profile, bad flag).
 *
 * This convention is documented in docs/cli-contract.md and locked before the CLI has an
 * audience, so updates never silently break someone's pipeline.
 */
export const EXIT = {
  SUCCESS: 0,
  DIFF: 1,
  ERROR: 2,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

/**
 * Map a thrown value to an exit code. A DRIFT mcpfold error maps to DIFF (1); every
 * other error — mcpfold or otherwise — maps to ERROR (2).
 */
export function exitCodeForError(error: unknown): ExitCode {
  if (isMcpfoldError(error) && error.code === 'DRIFT') return EXIT.DIFF;
  return EXIT.ERROR;
}
