import { existsSync, readFileSync } from 'node:fs';
import { isSecretRef, loadConfig, type Config } from '@mcpfold/core';
import { ALL_ADAPTERS, realOsContext, registerAll, type OsContext } from '@mcpfold/adapters';
import { findConfigPath } from '../util/config.js';
import { checkServer, describeViolation, loadPolicy } from '../util/policy.js';
import { maskTokens, Redactor } from '../util/redact.js';
import { scanClientRaw, securityFindings } from '../checks/security.js';
import type { Finding } from '../checks/types.js';
import { EXIT } from '../output/exit-codes.js';
import type { CommandOutput } from '../output/render.js';

/**
 * `mcpfold scan` (S18.2) — the security preflight. Where `doctor` checks config validity, `scan`
 * audits every detected client's on-disk config (and the canonical config) for the known 2025–26
 * MCP incident root causes: cleartext credentials, unpinned `@latest` stdio packages, and
 * known-vulnerable bridge versions. Each finding names the client, file, severity, and a concrete
 * fix. It is CI-gateable — exit 0 clean, 1 when actionable findings exist (info-only stays clean),
 * 2 on error — and supports `--json`. Secret VALUES never appear in the output: findings carry no
 * values, and every literal secret discovered is registered with the redactor so any accidental
 * echo is scrubbed.
 */

export interface ScanFinding extends Finding {
  /** Which client the finding belongs to (an adapter id, or "canonical"). */
  client: string;
}

export interface ScanData {
  findings: ScanFinding[];
  /** The config files that were audited. */
  scanned: string[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
}

export interface ScanOptions {
  cwd: string;
  osContext?: OsContext;
}

/** Register every literal (non-reference) secret-shaped value so it can never survive in output. */
function registerLiteralSecrets(config: Config, redactor: Redactor): void {
  const consider = (value: unknown): void => {
    if (typeof value !== 'string' || value.length === 0) return;
    if (isSecretRef(value)) return;
    if (maskTokens(value) !== value) redactor.register(value); // token-shaped literal
  };
  for (const server of Object.values(config.servers)) {
    for (const v of Object.values(server.env ?? {})) consider(v);
    consider(server.auth?.token);
    for (const v of Object.values(server.auth?.headers ?? {})) consider(v);
  }
}

/** Recursively register every token-shaped literal in a raw config so it can't survive in output. */
function registerRawSecrets(value: unknown, redactor: Redactor): void {
  if (typeof value === 'string') {
    if (!isSecretRef(value) && maskTokens(value) !== value) redactor.register(value);
  } else if (Array.isArray(value)) {
    for (const v of value) registerRawSecrets(v, redactor);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>))
      registerRawSecrets(v, redactor);
  }
}

export function runScan(options: ScanOptions): CommandOutput<ScanData> {
  registerAll();
  const ctx = options.osContext ?? realOsContext();
  const redactor = new Redactor();
  const findings: ScanFinding[] = [];
  const scanned: string[] = [];

  const tag = (client: string, list: Finding[]): void => {
    for (const f of list) findings.push({ ...f, client });
  };

  // 1. Every detected client's on-disk config.
  for (const adapter of ALL_ADAPTERS) {
    let path: string;
    try {
      path = adapter.resolvePath('user', undefined, ctx);
    } catch {
      continue; // adapter has no user-scope path
    }
    if (!path || !existsSync(path)) continue;
    scanned.push(path);
    const text = readFileSync(path, 'utf8');

    // Prefer scanning the RAW on-disk JSON — a scanner must see exactly what's on disk, not the
    // adapter-normalized model (which can drop or rewrite fields). Fall back to the adapter parse
    // for a non-JSON client format.
    let raw: Record<string, unknown> | null = null;
    try {
      raw = JSON.parse(text) as Record<string, unknown>;
    } catch {
      raw = null;
    }
    if (raw) {
      registerRawSecrets(raw, redactor);
      tag(adapter.id, scanClientRaw(raw, path));
      continue;
    }
    try {
      const servers = (adapter.parse(text).servers ?? {}) as Config['servers'];
      const config: Config = { version: 2, servers, profiles: {} };
      registerLiteralSecrets(config, redactor);
      tag(adapter.id, securityFindings(config, path));
    } catch {
      findings.push({
        client: adapter.id,
        severity: 'error',
        file: path,
        message: `Client config for "${adapter.id}" could not be parsed.`,
        fix: 'Fix the file, or re-run `mcpfold sync` to regenerate it.',
      });
    }
  }

  // 2. The canonical config, if present (adds the uncurated-servers informational check).
  const configPath = findConfigPath(options.cwd);
  if (configPath) {
    scanned.push(configPath);
    const result = loadConfig(readFileSync(configPath, 'utf8'));
    if (!result.ok) {
      findings.push({
        client: 'canonical',
        severity: 'error',
        file: configPath,
        message: 'The canonical config is invalid and could not be scanned.',
        fix: 'Run `mcpfold doctor` to see the validation error.',
      });
    } else {
      registerLiteralSecrets(result.config, redactor);
      tag('canonical', securityFindings(result.config, configPath, { canonical: true }));

      // 3. Org-policy violations (S18.3): any canonical server an org allow/deny policy blocks, with
      // the deciding rule + policy file as provenance. A denied server is an error-level finding.
      const loadedPolicy = loadPolicy(options.cwd, ctx);
      if (loadedPolicy) {
        for (const [name, server] of Object.entries(result.config.servers)) {
          const v = checkServer(loadedPolicy, name, server);
          if (v) {
            findings.push({
              client: 'canonical',
              severity: 'error',
              file: loadedPolicy.source,
              message: `Server "${name}" violates org policy: ${describeViolation(v)}.`,
              fix: 'Remove the server, or update the org policy if this is now approved.',
            });
          }
        }
      }
    }
  }

  // Belt-and-suspenders: scrub any token-shaped string a finding might echo (S18.2 redaction).
  const safe = redactor.deep(findings) as ScanFinding[];
  const errorCount = safe.filter((f) => f.severity === 'error').length;
  const warningCount = safe.filter((f) => f.severity === 'warning').length;
  const infoCount = safe.filter((f) => f.severity === 'info').length;

  return {
    data: { findings: safe, scanned, errorCount, warningCount, infoCount },
    human: renderHuman(safe, scanned, errorCount, warningCount, infoCount),
    // Info-only findings don't fail CI; any error/warning does.
    exit: errorCount + warningCount > 0 ? EXIT.DIFF : EXIT.SUCCESS,
  };
}

const ICON = { error: '✖', warning: '⚠', info: 'ℹ' } as const;

function renderHuman(
  findings: ScanFinding[],
  scanned: string[],
  errorCount: number,
  warningCount: number,
  infoCount: number,
): string {
  if (scanned.length === 0) {
    return 'No client configs or canonical config found to scan.';
  }
  if (findings.length === 0) {
    return `✓ scan found no security issues across ${scanned.length} config(s).`;
  }
  const lines = findings.map((f) => {
    const loc = f.where ? ` (${f.where})` : '';
    return [
      `${ICON[f.severity]} [${f.client}] ${f.file}${loc}`,
      `    ${f.message}`,
      `    fix: ${f.fix}`,
    ].join('\n');
  });
  return [
    ...lines,
    '',
    `${errorCount} error(s), ${warningCount} warning(s), ${infoCount} info across ${scanned.length} config(s).`,
  ].join('\n');
}
