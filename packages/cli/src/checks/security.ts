import {
  findMcpRemoteArg,
  isSecretRef,
  isVulnerableMcpRemoteVersion,
  MCP_REMOTE_PINNED_VERSION,
  type Config,
} from '@mcpfold/core';
import { maskTokens } from '../util/redact.js';
import type { Finding } from './types.js';
import {
  checkHardcodedSecrets,
  checkPinIntegrity,
  checkSecretSchemes,
  checkUnpinnedLatest,
} from './servers.js';

/**
 * Security preflight checks for `mcpfold scan` (S18.2). These map the verified 2025–26 MCP
 * incident root causes to scannable config properties: cleartext credentials, unpinned `@latest`
 * stdio packages, and known-vulnerable bridge versions. The per-server footgun checks are shared
 * with `doctor` (see ./servers.ts); this module adds the vulnerable-version table, the auth-token
 * literal check, and the "neither pin nor integrity" hygiene check, and composes them into one
 * {@link securityFindings} pass so `scan` can run it over every client's parsed config.
 */

/** One entry per known-vulnerable package. The single place to update when a new advisory lands. */
export interface KnownVulnerability {
  pkg: string;
  /** First SAFE version — anything below (or an unpinned spec) is treated as vulnerable. */
  fixedFrom: string;
  /** Advisory identifier (CVE / GHSA). */
  advisory: string;
  /** Human-readable vulnerable range, for the finding message. */
  range: string;
}

export const KNOWN_VULNERABILITIES: KnownVulnerability[] = [
  {
    pkg: 'mcp-remote',
    fixedFrom: MCP_REMOTE_PINNED_VERSION,
    advisory: 'CVE-2025-6514',
    range: '0.0.5–0.1.15',
  },
];

const AUTH_TOKEN_ENV = 'MCP_AUTH_TOKEN';

/** Flag a literal (non-reference) `auth.token` — the field doctor's env/header check doesn't cover. */
function checkAuthTokenLiterals(config: Config, file: string): Finding[] {
  const findings: Finding[] = [];
  for (const [name, server] of Object.entries(config.servers)) {
    const token = server.auth?.token;
    if (typeof token !== 'string' || token.length === 0) continue;
    if (isSecretRef(token)) continue;
    findings.push({
      severity: 'error',
      file,
      where: `servers.${name}.auth.token`,
      message: `Server "${name}" has a hardcoded auth token instead of a reference.`,
      fix: `Replace the literal with a reference, e.g. "\${env:${AUTH_TOKEN_ENV}}", then run \`mcpfold import\` to migrate it.`,
    });
  }
  return findings;
}

const NPX_PACKAGE_FLAGS = new Set(['-y', '--yes', '-p', '--package']);

/** The package spec an npx-style stdio launch resolves, or undefined when none is identifiable. */
function launchedPackageSpec(command: string | undefined, args: string[]): string | undefined {
  const flagIdx = args.findIndex((a) => NPX_PACKAGE_FLAGS.has(a));
  if (flagIdx >= 0 && flagIdx + 1 < args.length) return args[flagIdx + 1];
  if (command && /npx(\.cmd|\.exe)?$/i.test(command)) return args.find((a) => !a.startsWith('-'));
  return undefined;
}

/** True when a package spec carries an explicit `@version` (scoped `@scope/name@x` counts). */
function hasExplicitVersion(spec: string): boolean {
  const body = spec.startsWith('@') ? spec.slice(1) : spec;
  return body.includes('@');
}

/**
 * Flag a stdio server that launches a bare (unversioned) npx package — a moving target that lets a
 * compromised release land silently. `@latest` is covered (louder) by checkUnpinnedLatest, and
 * mcp-remote by the bridge check, so both are skipped here to avoid double-reporting.
 */
export function checkBareStdioPackage(config: Config, file: string): Finding[] {
  const findings: Finding[] = [];
  for (const [name, server] of Object.entries(config.servers)) {
    if (server.transport !== 'stdio') continue;
    const spec = launchedPackageSpec(server.command, server.args ?? []);
    if (!spec) continue;
    if (spec === 'mcp-remote' || spec.startsWith('mcp-remote@')) continue;
    if (spec.includes('@latest')) continue;
    if (!hasExplicitVersion(spec)) {
      findings.push({
        severity: 'warning',
        file,
        where: `servers.${name}`,
        message: `Server "${name}" launches an unpinned package "${spec}" (no explicit version).`,
        fix: `Pin the version (e.g. "${spec}@1.2.3") so a compromised release can't land silently.`,
      });
    }
  }
  return findings;
}

/** Flag stdio servers with neither a version pin nor an integrity hash (supply-chain hygiene). */
export function checkUnverifiedSupplyChain(config: Config, file: string): Finding[] {
  const findings: Finding[] = [];
  for (const [name, server] of Object.entries(config.servers)) {
    if (server.transport !== 'stdio') continue;
    // @latest is covered (louder) by checkUnpinnedLatest; avoid a duplicate here.
    const usesLatest = (server.args ?? []).some((a) => a.includes('@latest'));
    if (usesLatest) continue;
    if (!server.pin && !server.integrity) {
      findings.push({
        severity: 'info',
        file,
        where: `servers.${name}`,
        message: `Server "${name}" has neither a version pin nor an integrity hash.`,
        fix: 'Add a "pin" (and optionally an "integrity" SRI hash) to lock the launched package.',
      });
    }
  }
  return findings;
}

/**
 * Informational: canonical servers with no `tools` directive forgo tool curation (larger context,
 * broader surface). Only meaningful for the canonical config — client files don't carry directives.
 */
export function checkUncuratedServers(config: Config, file: string): Finding[] {
  const findings: Finding[] = [];
  for (const [name, server] of Object.entries(config.servers)) {
    if (!server.tools) {
      findings.push({
        severity: 'info',
        file,
        where: `servers.${name}`,
        message: `Server "${name}" has no tools directive — every tool it exposes is loaded.`,
        fix: `Add a "tools" allow/deny directive to curate the surface (fewer tokens, smaller attack surface).`,
      });
    }
  }
  return findings;
}

/**
 * Scan a RAW client config (as read from disk) for secrets and package footguns (S18.2). Working
 * on the raw JSON — rather than the adapter-parsed model — is deliberate: an adapter may normalize
 * a bridge or drop fields on parse, and a scanner must see exactly what is on disk. Detects
 * token-shaped literal values anywhere in a server entry, vulnerable mcp-remote bridges, unpinned
 * `@latest`, and bare (unversioned) package specs.
 */
export function scanClientRaw(parsed: Record<string, unknown>, file: string): Finding[] {
  const findings: Finding[] = [];
  const mcpRemote = KNOWN_VULNERABILITIES.find((v) => v.pkg === 'mcp-remote')!;

  for (const root of [parsed.mcpServers, parsed.servers]) {
    if (!root || typeof root !== 'object') continue;
    for (const [name, entry] of Object.entries(root as Record<string, unknown>)) {
      if (!entry || typeof entry !== 'object') continue;

      // 1. Secret-shaped literal values anywhere in the entry (env, headers, auth, args, …).
      collectSecretLiterals(entry, `servers.${name}`, file, findings);

      // 2. Package / bridge footguns from the launch args.
      const args = (entry as { args?: unknown }).args;
      const command = (entry as { command?: unknown }).command;
      if (!Array.isArray(args)) continue;
      const strArgs = args.filter((a): a is string => typeof a === 'string');
      const ref = findMcpRemoteArg(strArgs);
      if (ref && isVulnerableMcpRemoteVersion(ref.version)) {
        findings.push({
          severity: 'error',
          file,
          where: `servers.${name}`,
          message: ref.version
            ? `Server "${name}" bridges through mcp-remote@${ref.version} — ${mcpRemote.advisory} (vulnerable ${mcpRemote.range}).`
            : `Server "${name}" launches an unpinned "mcp-remote" — ${mcpRemote.advisory} (vulnerable ${mcpRemote.range}).`,
          fix: `Pin the bridge to mcp-remote@${mcpRemote.fixedFrom} (at or above the fix) — \`mcpfold sync\` rewrites it.`,
        });
        continue;
      }
      if (strArgs.some((a) => a.includes('@latest'))) {
        findings.push({
          severity: 'warning',
          file,
          where: `servers.${name}`,
          message: `Server "${name}" runs an unpinned @latest package.`,
          fix: `Pin the version (e.g. "pkg@1.2.3") so a compromised release can't land silently.`,
        });
        continue;
      }
      const spec = launchedPackageSpec(typeof command === 'string' ? command : undefined, strArgs);
      if (
        spec &&
        spec !== 'mcp-remote' &&
        !spec.startsWith('mcp-remote@') &&
        !hasExplicitVersion(spec)
      ) {
        findings.push({
          severity: 'warning',
          file,
          where: `servers.${name}`,
          message: `Server "${name}" launches an unpinned package "${spec}" (no explicit version).`,
          fix: `Pin the version (e.g. "${spec}@1.2.3") so a compromised release can't land silently.`,
        });
      }
    }
  }
  return findings;
}

/** Recursively flag token-shaped literal (non-reference) string values, with a dotted path. */
function collectSecretLiterals(value: unknown, path: string, file: string, out: Finding[]): void {
  if (typeof value === 'string') {
    if (!isSecretRef(value) && maskTokens(value) !== value) {
      out.push({
        severity: 'error',
        file,
        where: path,
        message: `A hardcoded secret-shaped value is present at ${path}.`,
        fix: 'Replace the literal with a reference, e.g. "${env:NAME}", then run `mcpfold import`.',
      });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => collectSecretLiterals(v, `${path}[${i}]`, file, out));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      collectSecretLiterals(v, `${path}.${k}`, file, out);
    }
  }
}

export interface SecurityScanOptions {
  /** When true, also run canonical-only checks (uncurated servers). Off for client files. */
  canonical?: boolean;
}

/** Run every security preflight check over one parsed config, returning all findings. */
export function securityFindings(
  config: Config,
  file: string,
  options: SecurityScanOptions = {},
): Finding[] {
  const findings = [
    ...checkHardcodedSecrets(config, file),
    ...checkAuthTokenLiterals(config, file),
    ...checkUnpinnedLatest(config, file),
    ...checkBareStdioPackage(config, file),
    ...checkPinIntegrity(config, file),
    ...checkSecretSchemes(config, file),
  ];
  // pin/integrity and tool-curation are canonical-config concepts (client files carry neither).
  if (options.canonical) {
    findings.push(...checkUnverifiedSupplyChain(config, file));
    findings.push(...checkUncuratedServers(config, file));
  }
  return findings;
}
