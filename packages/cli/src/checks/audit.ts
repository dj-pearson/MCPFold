import type { Config } from '@mcpfold/core';
import type { OsContext } from '@mcpfold/adapters';
import {
  auditLogSizeBytes,
  auditOptedOut,
  defaultAuditLogPath,
  resolveActiveAuditLog,
} from '../util/audit-log.js';
import type { Finding } from './types.js';

/** Bytes → a short human size for the disclosure line. */
function humanSize(n: number): string {
  if (n === 0) return 'empty';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Local audit-trail disclosure (S24.8). The proxy records tool-call NAMES by default so `mcpfold
 * curate` has data with zero setup; this `info` tells the user exactly where that file lives, how big
 * it is, and how to turn it off — so a default-on local recorder is never a surprise. Info-only: it
 * never affects doctor's exit code. `status` shows the same facts on its Audit line.
 */
export function checkAuditTrail(config: Config, ctx: OsContext): Finding[] {
  const path =
    resolveActiveAuditLog({ config, env: ctx.env }) ??
    defaultAuditLogPath(ctx.home, ctx.platform, ctx.env);
  const enabled = !auditOptedOut(config, ctx.env);
  const size = enabled ? humanSize(auditLogSizeBytes(path)) : 'off';
  return [
    {
      severity: 'info',
      file: path,
      message: enabled
        ? `Local audit trail is on (tool-call names only, never leaves this machine): ${size}.`
        : 'Local audit trail is off — `mcpfold curate` has no usage data to recommend from.',
      fix: enabled
        ? 'Disable with `audit.enabled: false` in mcp.config.jsonc or MCPFOLD_NO_AUDIT=1. It powers `mcpfold curate`.'
        : 'Re-enable by removing `audit.enabled: false` / unsetting MCPFOLD_NO_AUDIT so usage-based curation has data.',
    },
  ];
}
