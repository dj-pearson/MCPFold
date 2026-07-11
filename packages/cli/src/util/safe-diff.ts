import { diffRendered, UsageError, type ConfigDiff, type RenderedLike } from '@mcpfold/core';
import type { ClientAdapter } from '@mcpfold/adapters';

/**
 * `diffRendered` that never lets a raw parser exception escape (S22.8). Drift detection parses the
 * on-disk client file via the adapter, and many client configs are JSONC or may be user-corrupted;
 * a parse failure there is turned into a `UsageError` naming the offending file instead of a raw
 * SyntaxError crashing `diff`/`sync`/`pull`. The rendered (expected) side is always mcpfold's own
 * valid output, so a throw here is unambiguously the on-disk file.
 */
export function diffRenderedSafe(
  file: RenderedLike & { path: string },
  onDisk: string | undefined,
  adapter: Pick<ClientAdapter, 'parse'>,
): ConfigDiff {
  try {
    return diffRendered(file, onDisk, adapter);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new UsageError(`Could not read ${file.path}: ${detail}.`, {
      hint: 'Fix the JSON/JSONC syntax in that file, or remove it so mcpfold can re-create it.',
    });
  }
}
