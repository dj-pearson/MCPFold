import { findSecretRefs, isSecretRef, type Config } from '@mcpfold/core';
import { parseIntegrity } from '../trust/integrity.js';
import type { Finding } from './types.js';

/**
 * Server-level footgun checks (S3.7): unpinned `@latest`, hardcoded secrets hiding in
 * env/headers, and unknown/malformed secret-reference schemes.
 */

const SUSPICIOUS_KEY = /(token|secret|key|auth|pat|password|bearer)/i;

/** Flag stdio servers launching `@latest` with no `pin` (April-2026 RCE lesson). */
export function checkUnpinnedLatest(config: Config, file: string): Finding[] {
  const findings: Finding[] = [];
  for (const [name, server] of Object.entries(config.servers)) {
    if (server.transport !== 'stdio') continue;
    const usesLatest = (server.args ?? []).some((a) => a.includes('@latest'));
    if (usesLatest && !server.pin) {
      findings.push({
        severity: 'warning',
        file,
        where: `servers.${name}`,
        message: `Server "${name}" runs an unpinned @latest package.`,
        fix: `Add a "pin" (e.g. "pin": "1.4.2") so mcpfold rewrites @latest to a fixed version at fold time.`,
      });
    }
  }
  return findings;
}

/** Flag a pinned server whose `integrity` hash is malformed (can never match a real package). */
export function checkPinIntegrity(config: Config, file: string): Finding[] {
  const findings: Finding[] = [];
  for (const [name, server] of Object.entries(config.servers)) {
    if (typeof server.integrity === 'string' && parseIntegrity(server.integrity) === null) {
      findings.push({
        severity: 'error',
        file,
        where: `servers.${name}.integrity`,
        message: `Server "${name}" has a malformed integrity hash "${server.integrity}".`,
        fix: 'Use an SRI hash like "sha512-<base64>" (or remove the field).',
      });
    }
  }
  return findings;
}

/** Flag literal (non-reference) values in secret-bearing env/header fields. */
export function checkHardcodedSecrets(config: Config, file: string): Finding[] {
  const findings: Finding[] = [];
  for (const [name, server] of Object.entries(config.servers)) {
    const scan = (record: Record<string, string> | undefined, kind: 'env' | 'auth.headers') => {
      for (const [key, value] of Object.entries(record ?? {})) {
        if (isSecretRef(value)) continue;
        if (SUSPICIOUS_KEY.test(key)) {
          findings.push({
            severity: 'error',
            file,
            where: `servers.${name}.${kind}.${key}`,
            message: `"${key}" in server "${name}" looks like a hardcoded secret value.`,
            fix: `Replace the literal with a reference, e.g. "\${env:${key.toUpperCase().replace(/[^A-Z0-9]/g, '_')}}".`,
          });
        }
      }
    };
    scan(server.env, 'env');
    scan(server.auth?.headers, 'auth.headers');
  }
  return findings;
}

/** Flag secret references whose scheme is not one mcpfold knows how to resolve. */
export function checkSecretSchemes(config: Config, file: string): Finding[] {
  const findings: Finding[] = [];
  for (const [name, server] of Object.entries(config.servers)) {
    for (const ref of findSecretRefs(server)) {
      if (!ref.known) {
        findings.push({
          severity: 'warning',
          file,
          where: `servers.${name}.${ref.location}`,
          message: `Unknown secret-provider scheme "${ref.scheme}" in server "${name}".`,
          fix: `Use a supported scheme: env, dotenv, infisical, keychain, or op.`,
        });
      }
    }
  }
  return findings;
}
