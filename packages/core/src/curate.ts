import type { ToolsDirective } from './types.js';

/**
 * Curation intelligence (S23.1) — turn recorded proxy tool-call events into a per-server usage
 * summary and a recommended `allow` directive.
 *
 * The proxy audit log (S18.4) already records every `tools/call` that flows through mcpfold, so it
 * is the ground truth for "which tools does this agent actually use". This module is the pure engine
 * the CLI's `mcpfold curate` command sits on top of: it parses that redacted JSONL, aggregates it
 * into per-server / per-tool usage, and recommends the minimal `allow` list that would have covered
 * the observed usage — diffed against whatever directive is in the canonical config today.
 *
 * Core purity: no `node:fs`/`node:os`/network imports and no clock. Time filtering is done by the
 * caller passing an epoch-ms `sinceMs`; the CLI resolves `--since <days>` into that at its edge.
 */

/** The outcome classes the proxy records for a `tools/call` (mirrors AuditOutcome in the proxy). */
export type AuditOutcome = 'ok' | 'error' | 'denied';

/**
 * A parsed audit-log event, narrowed to the fields curation needs. This is intentionally a
 * structural subset of the proxy's `AuditEvent` so the two packages need not depend on each other —
 * the proxy owns writing the log, core owns reading it.
 */
export interface AuditEventLike {
  /** ISO-8601 timestamp. */
  ts: string;
  /** Canonical mcpfold server name the call was routed to. */
  server: string;
  /** `tools/call` for an invocation, `filter-drift` for a pinned-surface drift. */
  type: string;
  /** The tool name, when known. */
  tool?: string;
  /** Invocation outcome; absent for non-call events. */
  outcome?: AuditOutcome;
}

/** Per-outcome call tally for a single tool. */
export interface OutcomeCounts {
  ok: number;
  error: number;
  denied: number;
}

/** Usage of a single tool on a single server. */
export interface ToolUsage {
  tool: string;
  /** Total recorded `tools/call` events for this tool (all outcomes). */
  calls: number;
  /** Per-outcome breakdown. */
  outcomes: OutcomeCounts;
  /** ISO timestamp of the most recent recorded call, or undefined if none carried a timestamp. */
  lastTs?: string;
}

/** Aggregated usage for a single server. */
export interface ServerUsage {
  server: string;
  /** Tools used on this server, keyed by tool name. */
  tools: Map<string, ToolUsage>;
}

/** Options for {@link analyzeUsage}. */
export interface AnalyzeOptions {
  /** Drop events whose timestamp is strictly before this epoch-ms cutoff. */
  sinceMs?: number;
  /** After aggregating, drop tools with fewer than this many total calls. Default 1. */
  minCalls?: number;
}

/**
 * Parse raw JSONL audit-log lines into events, tolerating malformed input.
 *
 * A best-effort audit log can contain blank lines, a torn final line (process killed mid-write), or
 * a rotated/concatenated file. Any line that is blank or not valid JSON with the minimal event shape
 * (`{ server: string, type: string }`) is skipped rather than throwing, so one bad line never blinds
 * the whole report.
 */
export function parseAuditEvents(lines: Iterable<string>): AuditEventLike[] {
  const events: AuditEventLike[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof parsed !== 'object' || parsed === null) continue;
    const e = parsed as Record<string, unknown>;
    if (typeof e.server !== 'string' || typeof e.type !== 'string') continue;
    const event: AuditEventLike = {
      ts: typeof e.ts === 'string' ? e.ts : '',
      server: e.server,
      type: e.type,
    };
    if (typeof e.tool === 'string') event.tool = e.tool;
    if (e.outcome === 'ok' || e.outcome === 'error' || e.outcome === 'denied')
      event.outcome = e.outcome;
    events.push(event);
  }
  return events;
}

/**
 * Aggregate parsed events into per-server tool usage. Only `tools/call` events that name a tool are
 * counted; `filter-drift` and toolless events are ignored. `sinceMs` filters by timestamp (events
 * with no/invalid timestamp are kept — a call with an unknown time is still evidence it happened),
 * and `minCalls` drops rarely-used tools from the result after aggregation.
 */
export function analyzeUsage(
  events: Iterable<AuditEventLike>,
  options: AnalyzeOptions = {},
): Map<string, ServerUsage> {
  const minCalls = options.minCalls ?? 1;
  const sinceMs = options.sinceMs;
  const byServer = new Map<string, ServerUsage>();

  for (const e of events) {
    if (e.type !== 'tools/call' || !e.tool) continue;
    if (sinceMs !== undefined && e.ts) {
      const t = Date.parse(e.ts);
      if (!Number.isNaN(t) && t < sinceMs) continue;
    }
    let server = byServer.get(e.server);
    if (!server) {
      server = { server: e.server, tools: new Map() };
      byServer.set(e.server, server);
    }
    let usage = server.tools.get(e.tool);
    if (!usage) {
      usage = { tool: e.tool, calls: 0, outcomes: { ok: 0, error: 0, denied: 0 } };
      server.tools.set(e.tool, usage);
    }
    usage.calls += 1;
    if (e.outcome) usage.outcomes[e.outcome] += 1;
    if (e.ts && (usage.lastTs === undefined || e.ts > usage.lastTs)) usage.lastTs = e.ts;
  }

  if (minCalls > 1) {
    for (const server of byServer.values()) {
      for (const [name, usage] of server.tools) {
        if (usage.calls < minCalls) server.tools.delete(name);
      }
    }
  }
  return byServer;
}

/**
 * A tool counts as "used" (and so belongs in a recommended allow-list) if it was invoked at least
 * once with an `ok` or `error` outcome. A tool that was only ever `denied` was blocked by an existing
 * directive, not used — including it would defeat the point of curation, so it is excluded.
 */
export function usedTools(usage: ServerUsage): string[] {
  const used: string[] = [];
  for (const t of usage.tools.values()) {
    if (t.outcomes.ok > 0 || t.outcomes.error > 0) used.push(t.tool);
  }
  return used.sort();
}

/** The diff between a recommended allow-list and the current directive. */
export interface DirectiveDiff {
  /** Tools the recommendation adds relative to the current directive's effective allow-set. */
  added: string[];
  /** Tools the current directive allows that the recommendation drops (unused). */
  removed: string[];
  /** Tools present in both. */
  unchanged: string[];
}

/** The full recommendation for one server. */
export interface DirectiveRecommendation {
  /** The recommended directive: always `allow` mode with the sorted, de-duplicated used tools. */
  recommended: ToolsDirective;
  /** How it differs from the current directive (or from "everything" when there is none). */
  diff: DirectiveDiff;
  /** Whether the recommendation is identical to the current directive (nothing to apply). */
  unchanged: boolean;
  /**
   * Tools that are exposed/allowed today but were never successfully used — present only when
   * `knownTools` is supplied. These are the concrete savings a `curate --write` would capture.
   */
  unusedKnown?: string[];
}

/** Inputs to {@link recommendDirective}. */
export interface RecommendInput {
  /** Tool names observed as used (typically from {@link usedTools}). Order/duplication-insensitive. */
  used: Iterable<string>;
  /** The server's current `tools` directive, if any. */
  current?: ToolsDirective;
  /**
   * The tools currently exposed to the client — e.g. an allow-directive's own list, or a pinned
   * tool surface. Used only to compute {@link DirectiveRecommendation.unusedKnown}.
   */
  knownTools?: Iterable<string>;
}

/**
 * Recommend an `allow` directive from observed usage and diff it against the current one.
 *
 * The recommended list is the sorted, de-duplicated set of used tools. The diff compares that set to
 * the current directive's *effective allow-set*: an `allow` directive's own list, or — for a `deny`
 * directive or no directive — the union of the used and known tools (everything we have evidence the
 * client can currently see), so `removed` still surfaces tools that would be dropped by switching to
 * the tighter allow-list.
 */
export function recommendDirective(input: RecommendInput): DirectiveRecommendation {
  const recommendedList = [...new Set(input.used)].sort();
  const recommendedSet = new Set(recommendedList);
  const known = input.knownTools ? [...new Set(input.knownTools)].sort() : undefined;

  // The set the client can see today, to diff against.
  let currentAllow: Set<string>;
  if (input.current?.mode === 'allow') {
    currentAllow = new Set(input.current.list);
  } else {
    // `deny` or nothing: the visible surface is at least everything used + everything known.
    currentAllow = new Set<string>([...recommendedSet, ...(known ?? [])]);
    if (input.current?.mode === 'deny') for (const t of input.current.list) currentAllow.delete(t);
  }

  const added: string[] = [];
  const unchanged: string[] = [];
  for (const t of recommendedList) (currentAllow.has(t) ? unchanged : added).push(t);
  const removed = [...currentAllow].filter((t) => !recommendedSet.has(t)).sort();

  const recommended: ToolsDirective = { mode: 'allow', list: recommendedList };
  const isSameAsCurrent =
    input.current?.mode === 'allow' &&
    input.current.list.length === recommendedList.length &&
    [...input.current.list].sort().every((t, i) => t === recommendedList[i]);

  const rec: DirectiveRecommendation = {
    recommended,
    diff: { added, removed, unchanged },
    unchanged: isSameAsCurrent,
  };
  if (known) rec.unusedKnown = known.filter((t) => !recommendedSet.has(t));
  return rec;
}
