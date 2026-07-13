import { existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { applyEdits, modify } from 'jsonc-parser';
import {
  analyzeUsage,
  loadConfig,
  parseAuditEvents,
  recommendDirective,
  usedTools,
  UsageError,
  type OutcomeCounts,
  type ServerUsage,
  type ToolsDirective,
} from '@mcpfold/core';
import { findConfigPath, loadConfigFromDisk } from '../util/config.js';
import { readAuditLogLines } from '../util/audit-log.js';
import { atomicWrite } from '../io/atomic-write.js';
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
  /** Persist the recommended directives to the canonical config (S23.3). */
  write?: boolean;
  /** Show the diff and the resulting file but write nothing. */
  dryRun?: boolean;
  /** Skip the interactive confirmation before writing. */
  yes?: boolean;
  /** Injectable confirmation for tests; defaults to a readline prompt when interactive. */
  confirm?: () => Promise<boolean>;
  /** Whether stdin is a TTY (drives whether to prompt). Defaults to `process.stdin.isTTY`. */
  isTTY?: boolean;
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

  // Read the primary log plus any rotated siblings so usage reflects the full history (S23.4).
  const events = parseAuditEvents(readAuditLogLines(logPath));
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

/** A server whose directive the write path would change. */
type Applicable = CurateServerReport;

/**
 * The servers `--write` would actually touch: those not already curated and with at least one
 * safely-used tool. A server whose recorded calls were ALL denied yields an empty allow-list —
 * writing that would hide every tool, the opposite of intent — so it is skipped, not applied.
 */
function applicableServers(data: CurateData): Applicable[] {
  return data.servers.filter((s) => !s.alreadyCurated && s.recommended.list.length > 0);
}

/** One-line-per-server preview of the directive change the write would make. */
function renderWriteDiff(servers: Applicable[]): string {
  const lines: string[] = [];
  for (const s of servers) {
    lines.push(style.bold(s.server));
    lines.push(`  ${style.cyan('allow')} = [${s.recommended.list.join(', ')}]`);
    if (s.added.length > 0) lines.push(style.green(`  + ${s.added.join(', ')}`));
    if (s.unusedAllowed.length > 0) lines.push(style.red(`  - ${s.unusedAllowed.join(', ')}`));
  }
  return lines.join('\n');
}

/** Apply each server's recommended `tools` directive to the raw JSONC text, preserving comments. */
function applyDirectives(text: string, servers: Applicable[]): string {
  let out = text;
  for (const s of servers) {
    const edits = modify(out, ['servers', s.server, 'tools'], s.recommended, {
      formattingOptions: { insertSpaces: true, tabSize: 2 },
    });
    out = applyEdits(out, edits);
  }
  return out;
}

/** Ask for confirmation on a TTY; injectable for tests. */
async function defaultConfirm(): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = (await rl.question('Apply these changes? [y/N] ')).trim().toLowerCase();
    return answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}

/**
 * `mcpfold curate --write` (S23.3) — persist the recommended allow-lists to the canonical config.
 *
 * Idempotent: with nothing to apply it reports "already curated" and exits 0. `--dry-run` shows the
 * diff and the resulting file but writes nothing. Otherwise it writes only after confirmation —
 * `--yes` (or an injected/TTY confirm); in a non-interactive context without `--yes` it prints the
 * diff and declines to write. The JSONC edit preserves surrounding comments and formatting, and the
 * result is re-validated before it touches disk.
 */
export async function runCurateApply(opts: CurateOptions): Promise<CommandOutput<CurateData>> {
  const data = buildCurateData(opts);
  const servers = applicableServers(data);

  if (servers.length === 0) {
    return {
      data,
      human: `${style.green(symbols.ok)} Already curated — nothing to apply.`,
      exit: EXIT.SUCCESS,
    };
  }

  const diff = renderWriteDiff(servers);
  const configPath = findConfigPath(opts.cwd);
  if (!configPath) throw new UsageError(`No mcp.config.jsonc found in ${opts.cwd}.`);
  const text = readFileSync(configPath, 'utf8');

  if (opts.dryRun) {
    const newText = applyDirectives(text, servers);
    return {
      data,
      human: `${diff}\n\n${style.dim(`(dry run — ${configPath} unchanged)`)}\n\n${newText}`,
      exit: EXIT.SUCCESS,
    };
  }

  const isTTY = opts.isTTY ?? Boolean(process.stdin.isTTY);
  const confirm = opts.confirm ?? defaultConfirm;
  const confirmed = opts.yes === true || (isTTY && (await confirm()));
  if (!confirmed) {
    const why = isTTY ? 'Not applied.' : 'Not applied (non-interactive).';
    return {
      data,
      human: `${diff}\n\n${style.yellow(why)} Re-run with ${style.bold('--yes')} to write the changes.`,
      exit: EXIT.SUCCESS,
    };
  }

  const newText = applyDirectives(text, servers);
  const revalidated = loadConfig(newText);
  if (!revalidated.ok) {
    throw new UsageError(
      `Curating would make the config invalid: ${revalidated.errors[0]?.message ?? 'unknown error'}.`,
    );
  }
  atomicWrite(configPath, newText);

  const n = servers.length;
  return {
    data,
    human: `${diff}\n\n${style.green(symbols.ok)} Curated ${n} server${n === 1 ? '' : 's'} in ${configPath}.\nRun \`mcpfold sync\` to fold the tighter tool-sets out to your clients.`,
    exit: EXIT.SUCCESS,
  };
}
