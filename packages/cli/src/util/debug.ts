import { defaultRedactor } from './redact.js';

/**
 * Verbose debug logging (S0.6). Enabled by `--debug` or `MCPFOLD_DEBUG=1`. Output is
 * always routed through the default redactor, so even verbose logs cannot leak a secret
 * value or a ref path. Debug lines go to stderr to keep stdout clean for `--json`.
 */

let forced = false;

/** Called by the CLI when `--debug` is passed. */
export function enableDebug(): void {
  forced = true;
}

export function isDebugEnabled(): boolean {
  return forced || process.env.MCPFOLD_DEBUG === '1';
}

/** Log a redacted debug line to stderr when debug is enabled. */
export function debug(message: string, detail?: unknown): void {
  if (!isDebugEnabled()) return;
  const safeMessage = defaultRedactor.string(message);
  if (detail === undefined) {
    process.stderr.write(`[mcpfold:debug] ${safeMessage}\n`);
    return;
  }
  const safeDetail = defaultRedactor.deep(detail);
  process.stderr.write(`[mcpfold:debug] ${safeMessage} ${JSON.stringify(safeDetail)}\n`);
}
