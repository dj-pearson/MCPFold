import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/**
 * Read a proxy audit log together with its rotated siblings (S23.4).
 *
 * The audit sink (S18.4/S22.24) rotates at `maxBytes` by renaming the active log to a unique sibling
 * `${path}.<pid>.<seq>.<rand>` and starting a fresh primary. A consumer that reads only the primary
 * file therefore sees a partial history after any rotation — which for `mcpfold curate` could drop a
 * still-used tool from the recommendation. This reader returns the combined lines of the primary log
 * and every rotated sibling in the same directory, so usage reflects the full recorded history.
 *
 * Matching is scoped to THIS log's rotations: a sibling qualifies only if its name equals the
 * primary's basename or starts with `${basename}.` (the rotation prefix). Unrelated files in the
 * directory are ignored. Reads are best-effort: a sibling that disappears or fails to read between
 * the directory scan and the read is skipped rather than failing the whole command. Aggregation
 * downstream is order-independent (counts sum, last-seen takes the max), so sibling read order does
 * not matter.
 */
export function readAuditLogLines(primaryPath: string): string[] {
  const dir = dirname(primaryPath);
  const name = basename(primaryPath);
  const prefix = `${name}.`;

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    // Directory unreadable/nonexistent: fall back to just the primary if it happens to exist.
    entries = existsSync(primaryPath) ? [name] : [];
  }

  const files = entries.filter((f) => f === name || f.startsWith(prefix)).sort();
  const lines: string[] = [];
  for (const f of files) {
    try {
      const text = readFileSync(join(dir, f), 'utf8');
      for (const line of text.split('\n')) lines.push(line);
    } catch {
      // Rotated/removed between scan and read, or unreadable — skip best-effort.
    }
  }
  return lines;
}
