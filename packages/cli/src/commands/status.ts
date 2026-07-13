import { Buffer } from 'node:buffer';
import { existsSync } from 'node:fs';
import { realOsContext, requireAdapter, type OsContext } from '@mcpfold/adapters';
import {
  analyzeUsage,
  parseAuditEvents,
  recommendDirective,
  usedTools,
  type ClientId,
} from '@mcpfold/core';
import type { SecretProvider } from '@mcpfold/secrets';
import { runDiff } from './diff.js';
import { runDoctor } from './doctor.js';
import { summarizeCuration } from '../checks/curation.js';
import { detectClients } from '../util/detect-clients.js';
import { loadConfigFromDisk } from '../util/config.js';
import { readAuditLogLines } from '../util/audit-log.js';
import { loadSession, osKeychainBackend, type KeychainBackend } from '../cloud/token-store.js';
import { EXIT } from '../output/exit-codes.js';
import type { CommandOutput } from '../output/render.js';
import { style, symbols } from '../util/style.js';

/**
 * `mcpfold status` (S10.1) — the daily front door. Aggregates the existing read-only engines —
 * diff (drift per client), doctor (footgun error/warning counts), and the stored cloud session —
 * into one scannable summary. Never writes anything. Exit 0 when clean/in-sync, 1 when there is
 * actionable drift or any doctor finding, 2 on error (via the envelope runner).
 */

export interface StatusClient {
  client: string;
  profile: string;
  path: string;
  managed: boolean;
  inSync: boolean;
  added: number;
  changed: number;
  unmanaged: number;
  needsRestart: boolean;
}

export interface StatusCloud {
  loggedIn: boolean;
  endpoint: string;
  identity?: string;
}

/** S23.5: the trimmable-context opportunity, when an audit log is configured and something is curatable. */
export interface StatusCuration {
  /** The audit log the counts were computed from (primary path). */
  logPath: string;
  /** Servers whose `tools` directive would change if curated to observed usage. */
  curatableServers: number;
  /** Total currently-exposed-but-unused tools those servers would trim (allow-mode servers only). */
  trimmableTools: number;
}

export interface StatusData {
  clients: StatusClient[];
  /** S19.3: client ids installed on this machine but not yet in any profile (onboarding hint). */
  installedUnconfigured: string[];
  health: { errors: number; warnings: number };
  cloud: StatusCloud | null;
  /** S23.5: curation opportunity from recorded usage, or null when none/unavailable. */
  curation: StatusCuration | null;
  /**
   * S24.5: how many servers are curated vs. total. When `curatedServers` is 0 (and there is at least
   * one server) the headline feature is entirely unused — status nudges toward curation, mirroring the
   * doctor `info`. Null only when the config could not be read.
   */
  curationSummary: { totalServers: number; curatedServers: number } | null;
  ok: boolean;
}

export interface StatusOptions {
  cwd: string;
  osContext?: OsContext;
  providers?: SecretProvider[];
  /** Cloud session store; defaults to the OS keychain. Injectable for tests. */
  backend?: KeychainBackend;
}

/** Best-effort decode of the JWT `sub` for a friendly "logged in as" line (no verification). */
function identityOf(accessToken: string): string | undefined {
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return undefined;
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: string };
    return typeof json.sub === 'string' ? json.sub : undefined;
  } catch {
    return undefined;
  }
}

/**
 * S23.5: compute the curation opportunity from recorded proxy usage. Triggered only when an audit
 * log is configured (`MCPFOLD_AUDIT_LOG`, same signal as the S23.3 doctor hint) and readable. Reads
 * the full rotated history (S23.4), and for each server counts a curatable change when the
 * recommendation differs from the current directive and is non-empty. Returns null (line omitted)
 * when no log is set, it is unreadable, or nothing is curatable — never a false nudge, never an error.
 */
function computeCuration(cwd: string, env: NodeJS.ProcessEnv): StatusCuration | null {
  const logPath = env.MCPFOLD_AUDIT_LOG;
  if (!logPath || !existsSync(logPath)) return null;
  try {
    const events = parseAuditEvents(readAuditLogLines(logPath));
    const byServer = analyzeUsage(events);
    if (byServer.size === 0) return null;
    const { config } = loadConfigFromDisk(cwd);

    let curatableServers = 0;
    let trimmableTools = 0;
    for (const [name, usage] of byServer) {
      const current = config.servers[name]?.tools;
      const knownTools = current?.mode === 'allow' ? current.list : undefined;
      const rec = recommendDirective({ used: usedTools(usage), current, knownTools });
      if (!rec.unchanged && rec.recommended.list.length > 0) {
        curatableServers += 1;
        trimmableTools += rec.unusedKnown?.length ?? 0;
      }
    }
    return curatableServers > 0 ? { logPath, curatableServers, trimmableTools } : null;
  } catch {
    return null;
  }
}

function renderHuman(data: StatusData): string {
  const lines: string[] = [style.bold('Clients:')];
  if (data.clients.length === 0) lines.push(style.dim('  (none detected)'));
  for (const c of data.clients) {
    const state = !c.managed
      ? style.dim('unmanaged')
      : c.inSync
        ? style.green('in sync')
        : style.yellow(`drift (+${c.added} ~${c.changed} -${c.unmanaged})`);
    const restart = c.needsRestart && !c.inSync ? style.dim(' · needs restart') : '';
    const mark = c.inSync ? style.green(symbols.ok) : style.yellow(symbols.bullet);
    lines.push(`  ${mark} ${c.client} (${c.profile}): ${state}${restart}`);
  }
  if (data.installedUnconfigured.length > 0) {
    lines.push(
      style.dim(
        `  (installed, no profile yet: ${data.installedUnconfigured.join(', ')} — add a profile to fold to them)`,
      ),
    );
  }
  lines.push('');
  lines.push(
    data.health.errors === 0 && data.health.warnings === 0
      ? `${style.bold('Health:')} ${style.green(symbols.ok)} no problems`
      : `${style.bold('Health:')} ${style.red(`${data.health.errors} error(s)`)}, ${style.yellow(
          `${data.health.warnings} warning(s)`,
        )} (run \`mcpfold doctor\`)`,
  );
  if (data.cloud) {
    const who = data.cloud.identity ? ` as ${data.cloud.identity}` : '';
    lines.push(`${style.bold('Cloud:')} logged in${who} ${symbols.arrow} ${data.cloud.endpoint}`);
  }
  if (data.curation) {
    const n = data.curation.curatableServers;
    const trim =
      data.curation.trimmableTools > 0
        ? ` (${data.curation.trimmableTools} unused tool${data.curation.trimmableTools === 1 ? '' : 's'})`
        : '';
    lines.push(
      `${style.bold('Curation:')} ${style.yellow(`${n} server${n === 1 ? '' : 's'}`)} could be trimmed to your usage${trim} ${symbols.arrow} run \`mcpfold curate\``,
    );
  } else if (data.curationSummary && data.curationSummary.curatedServers === 0 && data.curationSummary.totalServers > 0) {
    // S24.5: no server is curated at all — the headline feature is unused. Mirror the doctor info.
    const total = data.curationSummary.totalServers;
    lines.push(
      `${style.bold('Curation:')} ${style.yellow('none configured')} — all ${total} server${total === 1 ? '' : 's'} expose their full toolsets ${symbols.arrow} run \`mcpfold curate\``,
    );
  }
  lines.push('');
  lines.push(
    data.ok
      ? style.green(`${symbols.ok} Everything looks good.`)
      : `${style.yellow(symbols.arrow)} Some items need attention.`,
  );
  return lines.join('\n');
}

export async function runStatus(options: StatusOptions): Promise<CommandOutput<StatusData>> {
  const ctx = options.osContext ?? realOsContext();
  const diff = await runDiff({ cwd: options.cwd, osContext: ctx, providers: options.providers });
  const doctor = runDoctor({ cwd: options.cwd, osContext: ctx });

  const clients: StatusClient[] = diff.data.clients.map((c) => {
    const servers = c.diff.servers;
    return {
      client: c.client,
      profile: c.profile,
      path: c.path,
      managed: !c.diff.fileMissing,
      inSync: !c.diff.hasDrift,
      added: servers.filter((s) => s.status === 'added').length,
      changed: servers.filter((s) => s.status === 'changed').length,
      unmanaged: servers.filter((s) => s.status === 'unmanaged').length,
      needsRestart: requireAdapter(c.client as ClientId).needsRestart,
    };
  });

  const health = { errors: doctor.data.errorCount, warnings: doctor.data.warningCount };

  let cloud: StatusCloud | null = null;
  const backend = options.backend ?? osKeychainBackend();
  const session = await loadSession(backend);
  if (session) {
    cloud = {
      loggedIn: true,
      endpoint: session.endpoint,
      identity: identityOf(session.accessToken),
    };
  }

  // S19.3: clients installed on the machine but not yet covered by any profile — an onboarding hint.
  const profileClients = new Set(clients.map((c) => c.client));
  const installedUnconfigured = detectClients(ctx)
    .filter((c) => c.state === 'installed-only' && !profileClients.has(c.id))
    .map((c) => c.id);

  // S23.5: curation opportunity from recorded usage — informational, never affects the exit code.
  const curation = computeCuration(options.cwd, ctx.env);

  // S24.5: how many servers are curated at all — surfaces "no curation configured" the same way doctor
  // does. Best-effort: an unreadable/invalid config (already reported by doctor) just omits the line.
  let curationSummary: StatusData['curationSummary'] = null;
  try {
    curationSummary = summarizeCuration(loadConfigFromDisk(options.cwd).config);
  } catch {
    curationSummary = null;
  }

  const ok = !diff.data.drift && health.errors === 0 && health.warnings === 0;
  const data: StatusData = {
    clients,
    installedUnconfigured,
    health,
    cloud,
    curation,
    curationSummary,
    ok,
  };
  return { data, human: renderHuman(data), exit: ok ? EXIT.SUCCESS : EXIT.DIFF };
}
