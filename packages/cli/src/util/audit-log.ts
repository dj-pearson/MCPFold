import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, posix, win32 } from 'node:path';
import type { Config } from '@mcpfold/core';

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

/** Env var that turns the default-on local audit trail OFF (S24.8). Distinct from telemetry's DO_NOT_TRACK. */
export const AUDIT_OPT_OUT_ENV = 'MCPFOLD_NO_AUDIT';

/**
 * The default local audit-log path (S24.8) — a per-user PLATFORM DATA directory, not the config dir
 * (the log is machine-local state, never synced). Windows: `%LOCALAPPDATA%\mcpfold\audit.log`; POSIX:
 * `$XDG_STATE_HOME/mcpfold/audit.log` (logs are "state"), falling back to `~/.local/state`.
 */
export function defaultAuditLogPath(
  home: string = homedir(),
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string {
  // Use the target platform's own path semantics (not the host's), so the result is deterministic
  // regardless of where this runs — the test matrix exercises both from a single OS.
  if (platform === 'win32') {
    const base = env.LOCALAPPDATA ?? win32.join(home, 'AppData', 'Local');
    return win32.join(base, 'mcpfold', 'audit.log');
  }
  const base = env.XDG_STATE_HOME ?? posix.join(home, '.local', 'state');
  return posix.join(base, 'mcpfold', 'audit.log');
}

/** True when the default-on audit trail is opted out — via the env var or `audit.enabled: false`. */
export function auditOptedOut(
  config: Pick<Config, 'audit'> | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env[AUDIT_OPT_OUT_ENV]) return true;
  return config?.audit?.enabled === false;
}

/**
 * Resolve the audit-log path a `mcpfold run` should write to (S24.8). Precedence: an explicit
 * `--audit-log`, then `MCPFOLD_AUDIT_LOG`, then — unless opted out — the default per-user path.
 * Returns undefined only when auditing is off (opted out and no explicit path).
 */
export function resolveActiveAuditLog(opts: {
  explicit?: string;
  config?: Pick<Config, 'audit'>;
  env?: NodeJS.ProcessEnv;
  home?: string;
  platform?: NodeJS.Platform;
}): string | undefined {
  const env = opts.env ?? process.env;
  if (opts.explicit) return opts.explicit;
  if (env.MCPFOLD_AUDIT_LOG) return env.MCPFOLD_AUDIT_LOG;
  if (auditOptedOut(opts.config, env)) return undefined;
  return defaultAuditLogPath(opts.home, opts.platform, env);
}

/** Total size in bytes of an audit log plus its rotated siblings, or 0 when none exist. */
export function auditLogSizeBytes(primaryPath: string): number {
  const dir = dirname(primaryPath);
  const name = basename(primaryPath);
  const prefix = `${name}.`;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return 0;
  }
  let total = 0;
  for (const f of entries.filter((x) => x === name || x.startsWith(prefix))) {
    try {
      total += statSync(join(dir, f)).size;
    } catch {
      // ignore a file that vanished between scan and stat
    }
  }
  return total;
}
