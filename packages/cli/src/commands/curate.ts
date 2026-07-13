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
import {
  cachedToolNames,
  readSnapshot,
  type CacheLocation,
  type SurfaceSnapshot,
  type ToolTokenEstimate,
} from '../discover/cache.js';
import { formatTokens, serverSavings } from '../discover/savings.js';
import { newUpstreamTools } from '../discover/staleness.js';
import { AUDIT_OPT_OUT_ENV, readAuditLogLines, resolveActiveAuditLog } from '../util/audit-log.js';
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
  /** S24.6: discovery-cache location override (tests point this at a temp dir). */
  cache?: CacheLocation;
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

/**
 * The known tool surface for a server: what curate can call out as allowed-but-unused. An allow
 * directive names it directly. For deny/no-directive, a live discovery snapshot (S24.6) supplies the
 * real surface — the deny list is subtracted so a denied tool isn't reported as trimmable. Without a
 * snapshot, deny/no-directive have no reliable surface, so knownTools stays undefined (unchanged pre-S24.6).
 */
function knownToolsFor(
  current: ToolsDirective | undefined,
  cached: string[] | null,
): string[] | undefined {
  if (current?.mode === 'allow') return current.list;
  if (!cached) return undefined;
  if (current?.mode === 'deny') {
    const denied = new Set(current.list);
    return cached.filter((t) => !denied.has(t));
  }
  return cached; // no directive: the full discovered surface is the known surface
}

/** Build one server's report from its aggregated usage, current directive, and cached surface. */
function reportForServer(
  usage: ServerUsage,
  current: ToolsDirective | undefined,
  cached: string[] | null = null,
): CurateServerReport {
  const tools: CurateToolRow[] = [...usage.tools.values()]
    .map((t) => ({ tool: t.tool, calls: t.calls, outcomes: t.outcomes, lastTs: t.lastTs }))
    .sort((a, b) => b.calls - a.calls || a.tool.localeCompare(b.tool));

  const knownTools = knownToolsFor(current, cached);
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
  const { config } = loadConfigFromDisk(opts.cwd);
  // S24.8: resolve the default per-user audit path with zero flags (unless opted out); an explicit
  // --audit-log / MCPFOLD_AUDIT_LOG still overrides.
  const logPath = resolveActiveAuditLog({ explicit: opts.auditLogPath, config, env: opts.env });
  if (!logPath) {
    throw new UsageError(
      'The local audit trail is disabled, so there is no recorded usage to curate.',
      {
        hint: `Re-enable it (remove \`audit.enabled: false\` / unset ${AUDIT_OPT_OUT_ENV}), or pass --audit-log <path>.`,
      },
    );
  }
  if (!existsSync(logPath)) {
    throw new UsageError(`No recorded tool usage yet at ${logPath}.`, {
      hint: 'Use your shimmed servers through `mcpfold run` (the default audit trail records tool names automatically), then re-run curate.',
    });
  }

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
    // S24.6: a cached discovery snapshot gives the full tool surface for deny/no-directive servers,
    // so "allowed but never used" is reported for them too — not just allow-mode.
    const cached = cachedToolNames(name, opts.cache);
    servers.push(reportForServer(usage, config.servers[name]?.tools, cached));
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

// --- Day-zero curation (S24.7) ---------------------------------------------------------------------

/** Interactive multi-select over a server's discovered tools; resolves to the chosen tool names. */
export type ToolPicker = (server: string, tools: ToolTokenEstimate[]) => Promise<string[]>;

export interface CuratePickOptions {
  cwd: string;
  /** The single server to curate. */
  server: string;
  /** Non-interactive selection (`--tools a,b,c`). Overrides the interactive picker when present. */
  tools?: string[];
  yes?: boolean;
  dryRun?: boolean;
  isTTY?: boolean;
  env?: NodeJS.ProcessEnv;
  cache?: CacheLocation;
  auditLogPath?: string;
  /** Live discovery fallback when no snapshot is cached; injectable for tests. */
  discover?: (server: string) => Promise<SurfaceSnapshot | null>;
  /** Interactive multi-select; injectable for tests. Defaults to a readline picker on a TTY. */
  pick?: ToolPicker;
  confirm?: () => Promise<boolean>;
}

export interface CuratePickData {
  server: string;
  /** 'usage' when recorded audit data drove the recommendation, else 'discovery' (day-zero). */
  source: 'usage' | 'discovery';
  selected: string[];
  fullCount: number;
  keptTokens: number;
  fullTokens: number;
  applied: boolean;
}

/** True when the audit log has any recorded usage for `server` (so usage-based should win). */
function hasUsageData(server: string, opts: CuratePickOptions): boolean {
  try {
    const data = buildCurateData({
      cwd: opts.cwd,
      server,
      auditLogPath: opts.auditLogPath,
      env: opts.env,
      cache: opts.cache,
    });
    const rep = data.servers.find((s) => s.server === server);
    return Boolean(rep && rep.recommended.list.length > 0);
  } catch {
    return false; // no log / not found / nothing recorded → day-zero
  }
}

/** A minimal readline multi-select: shows the tools and reads a comma list (blank/"all" = keep all). */
async function defaultPick(server: string, tools: ToolTokenEstimate[]): Promise<string[]> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    process.stderr.write(`Tools exposed by "${server}":\n`);
    tools.forEach((t, i) => process.stderr.write(`  ${i + 1}. ${t.name} (~${t.tokens} tok)\n`));
    const answer = (
      await rl.question('Keep which? comma-separated names or numbers (blank = all): ')
    ).trim();
    if (!answer || answer.toLowerCase() === 'all') return tools.map((t) => t.name);
    const picked = new Set<string>();
    for (const token of answer
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)) {
      const asNum = Number(token);
      if (Number.isInteger(asNum) && asNum >= 1 && asNum <= tools.length) {
        picked.add(tools[asNum - 1]!.name);
      } else if (tools.some((t) => t.name === token)) {
        picked.add(token);
      }
    }
    return [...picked];
  } finally {
    rl.close();
  }
}

/** Write a single server's `allow` directive through the comment-preserving jsonc path (S23.3). */
function applyOneDirective(text: string, server: string, directive: ToolsDirective): string {
  const edits = modify(text, ['servers', server, 'tools'], directive, {
    formattingOptions: { insertSpaces: true, tabSize: 2 },
  });
  return applyEdits(text, edits);
}

/**
 * `mcpfold curate <server>` day-zero path (S24.7). When there is NO recorded usage yet, curate from the
 * DISCOVERED tool surface instead of gating on audit history: `--tools <list>` non-interactively, or an
 * interactive multi-select on a TTY. Shows the impact ("keeping N of M tools, ~X → ~Y tokens (approx)")
 * before writing the `allow` directive through the comment-preserving jsonc edit path. When audit data
 * IS present, usage-based recommendations take precedence and the output says so.
 */
export async function runCuratePick(
  opts: CuratePickOptions,
): Promise<CommandOutput<CuratePickData>> {
  const { config } = loadConfigFromDisk(opts.cwd);
  if (!config.servers[opts.server]) {
    throw new UsageError(`No server "${opts.server}" in the canonical config.`);
  }

  // Usage precedence (criterion 5): when audit data exists, the recorded-usage recommendation wins.
  // We REPORT it read-only (the bare picker never auto-writes a usage-based change) and point at how
  // to apply it — `--tools` still lets the user override day-zero-style.
  if (!opts.tools && hasUsageData(opts.server, opts)) {
    const report = runCurate({
      cwd: opts.cwd,
      server: opts.server,
      auditLogPath: opts.auditLogPath,
      env: opts.env,
      cache: opts.cache,
    });
    const rep = report.data.servers.find((s) => s.server === opts.server);
    return {
      data: {
        server: opts.server,
        source: 'usage',
        selected: rep?.recommended.list ?? [],
        fullCount: rep?.recommended.list.length ?? 0,
        keptTokens: 0,
        fullTokens: 0,
        applied: false,
      },
      human: `${style.dim('Recorded usage is available and takes precedence over the day-zero picker.')}\n${report.human}\n${style.cyan(symbols.arrow)} Run \`mcpfold curate ${opts.server} --write\` to apply it, or \`--tools <list>\` to choose manually.`,
      exit: report.exit,
    };
  }

  // Day-zero: get the discovered surface (cached snapshot, else live discovery).
  const snapshot =
    readSnapshot(opts.server, opts.cache) ??
    (opts.discover ? await opts.discover(opts.server) : null);
  if (!snapshot || snapshot.tools.length === 0) {
    throw new UsageError(`No tool surface known for "${opts.server}" yet.`, {
      hint: `Run \`mcpfold inspect ${opts.server}\` to discover its tools, then re-run curate.`,
    });
  }

  // Selection: --tools wins; else interactive on a TTY; else refuse (need an explicit list).
  const isTTY = opts.isTTY ?? Boolean(process.stdin.isTTY);
  let selected: string[];
  if (opts.tools) {
    selected = opts.tools;
  } else if (isTTY) {
    selected = await (opts.pick ?? defaultPick)(opts.server, snapshot.tools);
  } else {
    throw new UsageError(`"${opts.server}" has no recorded usage to recommend from.`, {
      hint: `Pass \`--tools <a,b,c>\` to pick from its ${snapshot.tools.length} tools, or run on a terminal to choose interactively.`,
    });
  }

  const known = new Set(snapshot.tools.map((t) => t.name));
  const unknown = selected.filter((t) => !known.has(t));
  if (unknown.length > 0) {
    throw new UsageError(
      `These tools are not on "${opts.server}"'s surface: ${unknown.join(', ')}.`,
      { hint: `Available: ${snapshot.tools.map((t) => t.name).join(', ')}.` },
    );
  }

  const directive: ToolsDirective = { mode: 'allow', list: [...new Set(selected)].sort() };
  const savings = serverSavings(snapshot, directive);
  const preview = `keeping ${savings.keptCount} of ${savings.fullCount} tools, ${formatTokens(savings.fullTokens)} → ${formatTokens(savings.keptTokens)} tokens (approx)`;

  const configPath = findConfigPath(opts.cwd);
  if (!configPath) throw new UsageError(`No mcp.config.jsonc found in ${opts.cwd}.`);
  const text = readFileSync(configPath, 'utf8');
  const dataOf = (applied: boolean): CuratePickData => ({
    server: opts.server,
    source: 'discovery',
    selected: directive.list,
    fullCount: savings.fullCount,
    keptTokens: savings.keptTokens,
    fullTokens: savings.fullTokens,
    applied,
  });

  if (opts.dryRun) {
    const newText = applyOneDirective(text, opts.server, directive);
    return {
      data: dataOf(false),
      human: `${style.bold(opts.server)}: ${preview}\n${style.dim(`(dry run — ${configPath} unchanged)`)}\n\n${newText}`,
      exit: EXIT.SUCCESS,
    };
  }

  const confirm = opts.confirm ?? defaultConfirm;
  const confirmed = opts.yes === true || Boolean(opts.tools) || (isTTY && (await confirm()));
  if (!confirmed) {
    return {
      data: dataOf(false),
      human: `${style.bold(opts.server)}: ${preview}\n${style.yellow('Not applied.')} Re-run with ${style.bold('--yes')} to write it.`,
      exit: EXIT.SUCCESS,
    };
  }

  const newText = applyOneDirective(text, opts.server, directive);
  const revalidated = loadConfig(newText);
  if (!revalidated.ok) {
    throw new UsageError(
      `Curating would make the config invalid: ${revalidated.errors[0]?.message ?? 'unknown error'}.`,
    );
  }
  atomicWrite(configPath, newText);
  return {
    data: dataOf(true),
    human: `${style.bold(opts.server)}: ${preview}\n${style.green(symbols.ok)} Wrote an allow-list of ${directive.list.length} tool${directive.list.length === 1 ? '' : 's'} to ${configPath}.\nRun \`mcpfold sync\` to fold it out to your clients.`,
    exit: EXIT.SUCCESS,
  };
}

export interface CurateRefreshOptions {
  cwd: string;
  server: string;
  yes?: boolean;
  dryRun?: boolean;
  isTTY?: boolean;
  env?: NodeJS.ProcessEnv;
  cache?: CacheLocation;
  /** Live re-discovery; injectable for tests. Falls back to the cached snapshot when omitted. */
  discover?: (server: string) => Promise<SurfaceSnapshot | null>;
  confirm?: () => Promise<boolean>;
}

/**
 * `mcpfold curate <server> --refresh` (S24.11) — surface tools a server ships that its `allow` list
 * predates, and (with explicit consent) add them. Re-discovers the live surface, shows the diff, and
 * NEVER widens the allow-list without `--yes` or an interactive confirm. Deny/no-directive servers are
 * a no-op: new tools already pass through by construction.
 */
export async function runCurateRefresh(
  opts: CurateRefreshOptions,
): Promise<CommandOutput<CuratePickData>> {
  const { config } = loadConfigFromDisk(opts.cwd);
  const server = config.servers[opts.server];
  if (!server) throw new UsageError(`No server "${opts.server}" in the canonical config.`);

  const noop = (message: string): CommandOutput<CuratePickData> => ({
    data: {
      server: opts.server,
      source: 'discovery',
      selected: server.tools?.mode === 'allow' ? server.tools.list : [],
      fullCount: 0,
      keptTokens: 0,
      fullTokens: 0,
      applied: false,
    },
    human: message,
    exit: EXIT.SUCCESS,
  });

  if (server.tools?.mode !== 'allow') {
    return noop(
      `${style.dim(`"${opts.server}" has no allow-list — deny/uncurated servers already pass new tools through. Nothing to refresh.`)}`,
    );
  }

  const snapshot =
    (opts.discover ? await opts.discover(opts.server) : null) ??
    readSnapshot(opts.server, opts.cache);
  if (!snapshot) {
    throw new UsageError(`No tool surface known for "${opts.server}" to refresh against.`, {
      hint: `Run \`mcpfold inspect ${opts.server}\` first.`,
    });
  }

  const newTools = newUpstreamTools(server.tools, snapshot);
  if (newTools.length === 0) {
    return noop(
      `${style.green(symbols.ok)} "${opts.server}" is up to date — no new tools since its allow-list was written.`,
    );
  }

  const widened: ToolsDirective = {
    mode: 'allow',
    list: [...new Set([...server.tools.list, ...newTools])].sort(),
  };
  const diff = `${style.bold(opts.server)}: ${newTools.length} new tool${newTools.length === 1 ? '' : 's'} since your allow-list was written\n${style.green(`  + ${newTools.join(', ')}`)}`;
  const dataOf = (applied: boolean): CuratePickData => ({
    server: opts.server,
    source: 'discovery',
    selected: widened.list,
    fullCount: snapshot.toolCount,
    keptTokens: 0,
    fullTokens: snapshot.totalTokens,
    applied,
  });

  const configPath = findConfigPath(opts.cwd);
  if (!configPath) throw new UsageError(`No mcp.config.jsonc found in ${opts.cwd}.`);
  const text = readFileSync(configPath, 'utf8');

  if (opts.dryRun) {
    const newText = applyOneDirective(text, opts.server, widened);
    return {
      data: dataOf(false),
      human: `${diff}\n${style.dim(`(dry run — ${configPath} unchanged)`)}\n\n${newText}`,
      exit: EXIT.SUCCESS,
    };
  }

  // Consent gate: never widen an allow-list without explicit --yes or an interactive confirm.
  const isTTY = opts.isTTY ?? Boolean(process.stdin.isTTY);
  const confirm = opts.confirm ?? defaultConfirm;
  const confirmed = opts.yes === true || (isTTY && (await confirm()));
  if (!confirmed) {
    return {
      data: dataOf(false),
      human: `${diff}\n${style.yellow('Not added.')} Re-run with ${style.bold('--yes')} to widen the allow-list to include them.`,
      exit: EXIT.SUCCESS,
    };
  }

  const newText = applyOneDirective(text, opts.server, widened);
  const revalidated = loadConfig(newText);
  if (!revalidated.ok) {
    throw new UsageError(
      `Refreshing would make the config invalid: ${revalidated.errors[0]?.message ?? 'unknown error'}.`,
    );
  }
  atomicWrite(configPath, newText);
  return {
    data: dataOf(true),
    human: `${diff}\n${style.green(symbols.ok)} Added ${newTools.length} tool${newTools.length === 1 ? '' : 's'} to "${opts.server}"'s allow-list in ${configPath}.\nRun \`mcpfold sync\` to fold it out.`,
    exit: EXIT.SUCCESS,
  };
}
