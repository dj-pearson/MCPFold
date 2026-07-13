import { existsSync, readFileSync } from 'node:fs';
import {
  analyzeUsage,
  parseAuditEvents,
  recommendDirective,
  usedTools,
  UsageError,
  type OutcomeCounts,
  type ServerUsage,
  type ToolsDirective,
} from '@mcpfold/core';
import { loadConfigFromDisk } from '../util/config.js';
import { EXIT } from '../output/exit-codes.js';
import type { CommandOutput } from '../output/render.js';
import { style, symbols } from '../util/style.js';

/**
 * `mcpfold curate [server]` (S23.2) — close the loop on the token-tax metric.
 *
 * The proxy audit log (S18.4) records every `tools/call` that flows through mcpfold, but nothing
 * consumed it, so the headline `tools: {mode: allow, list}` directive still had to be hand-authored.
 * This command reads that redacted JSONL, aggregates per-server tool usage via the pure S23.1 engine,
 * and reports — per server — which tools were actually used and the minimal `allow` list that would
 * have covered them, diffed against the current config. This story is READ-ONLY; S23.3 adds `--write`.
 *
 * Honest metric: the log carries tool NAMES, not schemas, so savings are reported as a tool-count
 * reduction ("used N of M"), never a fabricated token number.
 */

/** Per-tool usage row in the report, sorted by call count descending. */
export interface CurateToolRow {
  tool: string;
  calls: number;
  outcomes: OutcomeCounts;
  lastTs?: string;
}

/** The curation report for a single server. */
export interface CurateServerReport {
  server: string;
  /** Tools with at least one recorded call, most-used first. */
  tools: CurateToolRow[];
  /** The current directive's mode, or null when the server has none. */
  currentMode: 'allow' | 'deny' | null;
  /** The recommended `allow` directive from observed usage. */
  recommended: ToolsDirective;
  /** Tools the recommendation adds vs. the current visible surface. */
  added: string[];
  /** Tools currently allowed but never successfully used (only meaningful in allow mode). */
  unusedAllowed: string[];
  /** True when the recommendation already matches the current directive (nothing to apply). */
  alreadyCurated: boolean;
}

export interface CurateData {
  /** Absolute path of the audit log that was read. */
  logPath: string;
  /** The `--since` window in days, when one was applied. */
  sinceDays?: number;
  /** The `--min-calls` threshold in effect. */
  minCalls: number;
  servers: CurateServerReport[];
}

export interface CurateOptions {
  cwd: string;
  /** Explicit audit-log path (from `--audit-log`); falls back to MCPFOLD_AUDIT_LOG. */
  auditLogPath?: string;
  /** Narrow the report to a single server. */
  server?: string;
  /** Only count calls at or after now minus this many days. */
  sinceDays?: number;
  /** Drop tools with fewer than this many total calls. */
  minCalls?: number;
  /** Injectable clock (ms since epoch) for deterministic tests. */
  now?: () => number;
  /** Injectable env lookup for tests. */
  env?: NodeJS.ProcessEnv;
}

/** Resolve the audit-log path from the flag or env, or throw a UsageError naming both. */
export function resolveAuditLogPath(opts: {
  auditLogPath?: string;
  env?: NodeJS.ProcessEnv;
}): string {
  const path = opts.auditLogPath ?? (opts.env ?? process.env).MCPFOLD_AUDIT_LOG;
  if (!path) {
    throw new UsageError(
      'No audit log to read: pass --audit-log <path> or set MCPFOLD_AUDIT_LOG.',
      {
        hint: 'Run your servers through the proxy with `mcpfold run <server> --audit-log <path>` (or set MCPFOLD_AUDIT_LOG) to record tool usage first.',
      },
    );
  }
  return path;
}

/** Build one server's report from its aggregated usage and current directive. */
function reportForServer(
  usage: ServerUsage,
  current: ToolsDirective | undefined,
): CurateServerReport {
  const tools: CurateToolRow[] = [...usage.tools.values()]
    .map((t) => ({ tool: t.tool, calls: t.calls, outcomes: t.outcomes, lastTs: t.lastTs }))
    .sort((a, b) => b.calls - a.calls || a.tool.localeCompare(b.tool));

  // Only an allow directive gives us a reliable "known" surface to call out as unused; for deny/none
  // we don't know the full tool list without a live tools/list, so we omit knownTools there.
  const knownTools = current?.mode === 'allow' ? current.list : undefined;
  const rec = recommendDirective({ used: usedTools(usage), current, knownTools });

  return {
    server: usage.server,
    tools,
    currentMode: current?.mode ?? null,
    recommended: rec.recommended,
    added: rec.diff.added,
    unusedAllowed: rec.unusedKnown ?? [],
    alreadyCurated: rec.unchanged,
  };
}

function renderHuman(data: CurateData): string {
  const lines: string[] = [];
  const window = data.sinceDays ? ` (last ${data.sinceDays}d)` : '';
  lines.push(style.bold(`Tool usage from ${data.logPath}${window}`));
  lines.push('');

  if (data.servers.length === 0) {
    lines.push(style.dim('  No recorded tool calls found for the requested scope.'));
    lines.push('');
    lines.push(
      style.dim(
        '  Route servers through the proxy (`mcpfold run <server> --audit-log …`) to build a usage history.',
      ),
    );
    return lines.join('\n');
  }

  for (const s of data.servers) {
    const usedCount = s.recommended.list.length;
    lines.push(
      `${style.bold(s.server)} ${style.dim(`— used ${usedCount} tool${usedCount === 1 ? '' : 's'}`)}`,
    );
    for (const t of s.tools) {
      const bad = t.outcomes.error + t.outcomes.denied;
      const tail =
        bad > 0 ? style.dim(` (${t.outcomes.error} err, ${t.outcomes.denied} denied)`) : '';
      lines.push(`  ${style.green(symbols.ok)} ${t.tool} ${style.dim(`×${t.calls}`)}${tail}`);
    }
    if (s.unusedAllowed.length > 0) {
      lines.push(
        style.yellow(`  ${symbols.bullet} allowed but never used: ${s.unusedAllowed.join(', ')}`),
      );
    }
    if (s.alreadyCurated) {
      lines.push(style.dim('  already curated to what you use.'));
    } else {
      lines.push(
        `  ${style.cyan(symbols.arrow)} recommend allow: ${s.recommended.list.join(', ') || style.dim('(none)')}`,
      );
    }
    lines.push('');
  }

  const changeable = data.servers.filter((s) => !s.alreadyCurated).length;
  lines.push(
    changeable === 0
      ? style.green(`${symbols.ok} Every server is already curated to its usage.`)
      : `${style.cyan(symbols.arrow)} Run \`mcpfold curate --write\` to apply the recommended allow-lists.`,
  );
  return lines.join('\n');
}

/**
 * Analyze the audit log and build the report data. Shared with S23.3's `--write` path so both read
 * and mutate from an identical view of usage.
 */
export function buildCurateData(opts: CurateOptions): CurateData {
  const logPath = resolveAuditLogPath(opts);
  if (!existsSync(logPath)) {
    throw new UsageError(`Audit log not found: ${logPath}`, {
      hint: 'Check the path, or record usage first with `mcpfold run <server> --audit-log <path>`.',
    });
  }
  const { config } = loadConfigFromDisk(opts.cwd);

  const now = opts.now ?? (() => Date.now());
  const sinceMs =
    opts.sinceDays !== undefined ? now() - opts.sinceDays * 24 * 60 * 60 * 1000 : undefined;
  const minCalls = opts.minCalls ?? 1;

  const contents = readFileSync(logPath, 'utf8');
  const events = parseAuditEvents(contents.split('\n'));
  const byServer = analyzeUsage(events, { sinceMs, minCalls });

  const wanted = opts.server;
  const servers: CurateServerReport[] = [];
  for (const [name, usage] of byServer) {
    if (wanted && name !== wanted) continue;
    if (usage.tools.size === 0) continue;
    servers.push(reportForServer(usage, config.servers[name]?.tools));
  }
  servers.sort((a, b) => a.server.localeCompare(b.server));

  const data: CurateData = { logPath, minCalls, servers };
  if (opts.sinceDays !== undefined) data.sinceDays = opts.sinceDays;
  return data;
}

/** `mcpfold curate` — read-only usage report. Always exits 0 on a successful report. */
export function runCurate(opts: CurateOptions): CommandOutput<CurateData> {
  const data = buildCurateData(opts);
  return { data, human: renderHuman(data), exit: EXIT.SUCCESS };
}
