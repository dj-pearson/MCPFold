import { existsSync } from 'node:fs';
import { analyzeUsage, parseAuditEvents, type Config } from '@mcpfold/core';
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
