import { existsSync, readFileSync } from 'node:fs';
import { analyzeUsage, parseAuditEvents, type Config } from '@mcpfold/core';
import { requireAdapter, type OsContext } from '@mcpfold/adapters';
import { shouldUseProxy } from '../commands/run.js';
import { readAuditLogLines } from '../util/audit-log.js';
import type { Finding } from './types.js';

/**
 * Curation-opportunity hint (S23.3). When an audit log is configured (`MCPFOLD_AUDIT_LOG`) and a
 * server has recorded tool calls but no `tools` directive, `mcpfold doctor` points at the exact
 * `mcpfold curate` command that would tighten it. Informational only — never an error, so it can
 * never break a `doctor`-gated pipeline. Silent when no audit log is set or readable.
 */
export function checkCurationOpportunity(
  config: Config,
  configPath: string,
  env: NodeJS.ProcessEnv,
): Finding[] {
  const logPath = env.MCPFOLD_AUDIT_LOG;
  if (!logPath || !existsSync(logPath)) return [];

  let events;
  try {
    events = parseAuditEvents(readAuditLogLines(logPath));
  } catch {
    return [];
  }
  const usage = analyzeUsage(events);

  const findings: Finding[] = [];
  for (const [name, server] of Object.entries(config.servers)) {
    if (server.tools) continue; // already curated (allow/deny directive present)
    const used = usage.get(name);
    if (!used || used.tools.size === 0) continue;
    findings.push({
      severity: 'info',
      file: configPath,
      where: `servers.${name}`,
      message: `"${name}" has recorded tool usage but no \`tools\` directive — every tool loads into context.`,
      fix: `Run \`mcpfold curate ${name}\` to see usage and \`mcpfold curate ${name} --write\` to apply the recommended allow-list.`,
    });
  }
  return findings;
}

/** True when a rendered client entry routes through the `mcpfold run` proxy shim (S24.1). */
function isShimEntry(entry: unknown): boolean {
  if (!entry || typeof entry !== 'object') return false;
  const { command, args } = entry as { command?: unknown; args?: unknown };
  return command === 'mcpfold' && Array.isArray(args) && args[0] === 'run';
}

/**
 * Inert-curation check (S24.5). A `tools` directive only filters behind the `mcpfold run` proxy, and
 * `sync` routes every stdio tools-bearing server through the shim (S24.1). But a client file written
 * before S24.1 — or hand-edited — can point a curated server straight at its real command, so the
 * directive silently does nothing and every tool still loads. This reads each profile's on-disk client
 * file and raises an ERROR for any tools-directive server whose rendered entry is not the shim, with
 * the exact resync fix. Since S24.10 this covers remote (bridged) curated servers too — they also fold
 * to the `mcpfold run` shim, which proxies the mcp-remote bridge.
 */
export function checkCurationInactive(config: Config, ctx: OsContext): Finding[] {
  const findings: Finding[] = [];
  for (const [profileName, profile] of Object.entries(config.profiles)) {
    let path: string;
    try {
      path = requireAdapter(profile.client).resolvePath(profile.scope, profile.path, ctx);
    } catch {
      continue;
    }
    if (!existsSync(path)) continue;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    } catch {
      continue; // malformed JSON is already reported by checkClientFiles
    }

    for (const rootKey of ['mcpServers', 'servers'] as const) {
      const root = parsed[rootKey];
      if (!root || typeof root !== 'object') continue;
      for (const [name, entry] of Object.entries(root as Record<string, unknown>)) {
        const server = config.servers[name];
        // Any curated server (stdio or remote/bridged since S24.10) must route through the run shim.
        if (!server || !server.tools || !shouldUseProxy(server)) continue;
        if (isShimEntry(entry)) continue;
        findings.push({
          severity: 'error',
          file: path,
          where: `${rootKey}.${name}`,
          message: `Curated server "${name}" (profile "${profileName}") launches its real command directly in this client file, bypassing the mcpfold proxy — its \`tools\` directive has no effect and every tool loads into context.`,
          fix: `Run \`mcpfold sync\` to re-fold "${name}" through the \`mcpfold run\` proxy shim (this file predates the fix, or was hand-edited).`,
        });
      }
    }
  }
  return findings;
}

/**
 * "No curation at all" nudge (S24.5). When not a single server carries a `tools` directive, the
 * headline token-tax feature is entirely unused — every client loads every tool. Emits one `info`
 * (never an error, so it can't break a doctor-gated pipeline) pointing at the curate / discovery next
 * step. Silent when at least one server is curated, or when there are no servers.
 */
export function checkNoCurationConfigured(config: Config, configPath: string): Finding[] {
  const summary = summarizeCuration(config);
  if (summary.totalServers === 0 || summary.curatedServers > 0) return [];
  return [
    {
      severity: 'info',
      file: configPath,
      message: `No tool curation configured — all ${summary.totalServers} server${summary.totalServers === 1 ? '' : 's'} expose their full toolsets to every client.`,
      fix: 'Add a `tools` allow-list to trim each server, or run `mcpfold curate` (with a recorded audit log) to get a usage-based recommendation.',
    },
  ];
}

/** S24.5: a scannable summary of how many servers are curated, shared by doctor and status. */
export interface CurationSummary {
  totalServers: number;
  /** Servers carrying a `tools` directive (allow/deny). */
  curatedServers: number;
}

export function summarizeCuration(config: Config): CurationSummary {
  const servers = Object.values(config.servers);
  return {
    totalServers: servers.length,
    curatedServers: servers.filter((s) => s.tools).length,
  };
}
