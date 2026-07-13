/**
 * Pure, vscode-free model for the "Curate to usage" CodeLens (E23 surface).
 *
 * The extension never reimplements curation logic — it shells out to `mcpfold curate --json` and
 * renders the result. This module parses that envelope and turns it, together with the server key
 * positions from {@link ./tokenBudget#computeConfigBudget}, into a list of lens descriptors. Keeping
 * it dependency-free (no `vscode`, no `child_process`) means it is unit-testable in plain Node and
 * can never drift into duplicating the CLI's engine.
 */

/** One server's curation status, distilled from the `mcpfold curate --json` envelope. */
export interface CurateServerReport {
  server: string;
  /** Tools the server actually used (the recommended allow-list size). */
  usedCount: number;
  /** Tools currently allowed but never used — the concrete savings `--write` would capture. */
  unusedCount: number;
  /** True when the current directive already matches observed usage (nothing to apply). */
  alreadyCurated: boolean;
}

/**
 * Parse `mcpfold curate --json` stdout into a per-server report map, or null when the output is not a
 * recognizable success envelope (CLI too old, no audit log, an error, or noise). Tolerant of leading
 * non-JSON lines (e.g. an npx banner): the envelope is the last JSON-object line.
 */
export function parseCurateReport(stdout: string): Map<string, CurateServerReport> | null {
  const envelope = parseLastJsonObject(stdout);
  if (
    !envelope ||
    envelope.ok !== true ||
    envelope.command !== 'curate' ||
    typeof envelope.data !== 'object' ||
    envelope.data === null
  ) {
    return null;
  }
  const data = envelope.data as { servers?: unknown };
  if (!Array.isArray(data.servers)) return null;

  const report = new Map<string, CurateServerReport>();
  for (const raw of data.servers) {
    if (typeof raw !== 'object' || raw === null) continue;
    const s = raw as {
      server?: unknown;
      recommended?: { list?: unknown };
      unusedAllowed?: unknown;
      alreadyCurated?: unknown;
    };
    if (typeof s.server !== 'string') continue;
    const usedCount = Array.isArray(s.recommended?.list) ? s.recommended!.list!.length : 0;
    const unusedCount = Array.isArray(s.unusedAllowed) ? s.unusedAllowed.length : 0;
    report.set(s.server, {
      server: s.server,
      usedCount,
      unusedCount,
      alreadyCurated: s.alreadyCurated === true,
    });
  }
  return report;
}

/** Parse the last line of `text` that is a JSON object, or null. */
function parseLastJsonObject(text: string): Record<string, unknown> | null {
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim();
    if (!line || line[0] !== '{') continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (typeof parsed === 'object' && parsed !== null) return parsed as Record<string, unknown>;
    } catch {
      // keep scanning older lines
    }
  }
  return null;
}

/** A server key and the 0-based line it sits on (from computeConfigBudget). */
export interface ServerAnchor {
  name: string;
  line: number;
}

/** A resolved CodeLens descriptor: where to anchor it, what to show, and what it invokes. */
export interface CurationLens {
  line: number;
  title: string;
  tooltip: string;
  /** Command id to run on click; omitted for a purely informational lens. */
  command?: string;
  /** Arguments passed to the command. */
  args?: unknown[];
}

/**
 * Build the curation lenses for the servers present in the config, given a parsed report. A server
 * with recorded usage that is not yet curated gets an actionable "Curate to usage" lens; one already
 * curated gets a dim confirmation; a server with no usage data gets nothing (so the annotation only
 * appears where it is actionable). Returns an empty array when there is no report.
 */
export function buildCurationLenses(
  anchors: ServerAnchor[],
  report: Map<string, CurateServerReport> | null,
): CurationLens[] {
  if (!report) return [];
  const lenses: CurationLens[] = [];
  for (const anchor of anchors) {
    const r = report.get(anchor.name);
    if (!r) continue;
    const usedLabel = `${r.usedCount} tool${r.usedCount === 1 ? '' : 's'}`;
    if (r.alreadyCurated || r.unusedCount === 0) {
      lenses.push({
        line: anchor.line,
        title: `$(check) curated to your usage (${usedLabel})`,
        tooltip: `"${anchor.name}" already exposes only the tools you use, based on recorded proxy usage.`,
      });
    } else {
      const trim = `${r.unusedCount} unused`;
      lenses.push({
        line: anchor.line,
        title: `$(sparkle) uses ${usedLabel} · ${trim} — Curate to usage`,
        tooltip: `"${anchor.name}" exposes ${r.unusedCount} tool(s) you have never used. Click to write an allow-list of just your ${usedLabel} (mcpfold curate ${anchor.name} --write).`,
        command: 'mcpfold.curateServer',
        args: [anchor.name],
      });
    }
  }
  return lenses;
}

/** Count of servers that have an actionable (not-yet-curated) recommendation. */
export function curatableCount(report: Map<string, CurateServerReport> | null): number {
  if (!report) return 0;
  let n = 0;
  for (const r of report.values()) if (!r.alreadyCurated && r.unusedCount > 0) n++;
  return n;
}
