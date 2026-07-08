/**
 * Doctor check contract (S3.7). Every check returns findings that each name the exact
 * file, the issue, and the fix — no vague "something is wrong".
 */

export type Severity = 'error' | 'warning' | 'info';

export interface Finding {
  severity: Severity;
  /** The file the finding is about (canonical config or an on-disk client file). */
  file: string;
  /** Optional JSON path / server name within the file. */
  where?: string;
  message: string;
  /** The concrete fix. */
  fix: string;
}
