import { existsSync, readFileSync } from 'node:fs';
import { checkRendered, hasDrift, type CheckableFile, type CheckResult } from '@mcpfold/core';
import { EXIT } from '../output/exit-codes.js';
import type { CommandOutput } from '../output/render.js';

/**
 * `mcpfold sync --check` (S0.8) — the CI-gateable drift check.
 *
 * Compares the files mcpfold WOULD render against what is on disk and exits nonzero
 * (EXIT.DIFF) when any file drifts or is missing, writing nothing. The determinism
 * invariant (serialize.ts) guarantees the comparison is stable. Real per-client rendering
 * is supplied by adapters at S3.5; here the rendered set is injected, so the check
 * plumbing and exit-code contract are complete and tested ahead of the adapters.
 */

export interface SyncCheckDeps {
  /** The files that would be written (produced by adapters at S3.5). */
  rendered: CheckableFile[];
  /** Injectable disk reader; defaults to fs. */
  readFile?: (path: string) => string | undefined;
}

export interface SyncCheckData {
  results: CheckResult[];
  drift: boolean;
}

function symbol(status: CheckResult['status']): string {
  return status === 'ok' ? '✓' : status === 'drift' ? '✗ drift  ' : '✗ missing';
}

export function runSyncCheck(deps: SyncCheckDeps): CommandOutput<SyncCheckData> {
  const read =
    deps.readFile ?? ((p: string) => (existsSync(p) ? readFileSync(p, 'utf8') : undefined));
  const results = checkRendered(deps.rendered, read);
  const drift = hasDrift(results);

  const human =
    results.length === 0
      ? 'Nothing to check — no client files would be rendered yet (adapters land in S3.5).'
      : results.map((r) => `  ${symbol(r.status)}  ${r.path}`).join('\n') +
        (drift
          ? '\n\nDrift detected. Run `mcpfold sync` to update client files.'
          : '\n\nAll client files are up to date.');

  return { data: { results, drift }, human, exit: drift ? EXIT.DIFF : EXIT.SUCCESS };
}
