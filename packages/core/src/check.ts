import { isByteIdentical } from './serialize.js';

/**
 * Drift-check engine for `sync --check` (S0.8).
 *
 * Given the files mcpfold WOULD write and a reader for what's on disk, classify each as
 * up-to-date, drifted, or missing — without writing anything. `sync --check` exits
 * nonzero (exit 1) when any file is not `ok`, making sync-freshness CI-gateable. Pure:
 * the disk reader is injected, so this stays in the I/O-free core.
 */

/** The minimal shape of a rendered file this engine needs (RenderedFile satisfies it). */
export interface CheckableFile {
  path: string;
  contents: string;
}

export type CheckStatus = 'ok' | 'drift' | 'missing';

export interface CheckResult {
  path: string;
  status: CheckStatus;
}

/** Reader returns the on-disk contents for a path, or `undefined` if it does not exist. */
export type FileReader = (path: string) => string | undefined;

/** Compare each rendered file against on-disk contents. Writes nothing. */
export function checkRendered(files: CheckableFile[], readFile: FileReader): CheckResult[] {
  return files.map((file) => {
    const onDisk = readFile(file.path);
    if (onDisk === undefined) return { path: file.path, status: 'missing' };
    return {
      path: file.path,
      status: isByteIdentical(onDisk, file.contents) ? 'ok' : 'drift',
    };
  });
}

/** True when any file has drifted or is missing (→ nonzero exit for `--check`). */
export function hasDrift(results: CheckResult[]): boolean {
  return results.some((r) => r.status !== 'ok');
}
