import { findSecretRefs, isSecretRef, type Config } from '@mcpfold/core';
import { parseIntegrity } from '../trust/integrity.js';
import type { Finding } from './types.js';

/**
 * Server-level footgun checks (S3.7): unpinned `@latest`, hardcoded secrets hiding in
 * env/headers, and unknown/malformed secret-reference schemes.
 */

const SUSPICIOUS_KEY = /(token|secret|key|auth|pat|password|bearer)/i;

/**
 * Flag servers on the deprecated `sse` transport (S17.5). The MCP spec deprecated the HTTP+SSE
 * transport on 2025-11-25 in favor of Streamable HTTP; `sse` still loads and folds, but authors
 * should migrate to `streamable-http`.
 */
export function checkDeprecatedTransports(config: Config, file: string): Finding[] {
  const findings: Finding[] = [];
  for (const [name, server] of Object.entries(config.servers)) {
    if (server.transport === 'sse') {
      findings.push({
        severity: 'warning',
        file,
        where: `servers.${name}`,
        message: `Server "${name}" uses the deprecated "sse" transport (MCP deprecated HTTP+SSE on 2025-11-25).`,
        fix: 'Switch to "transport": "streamable-http" once the server supports it.',
        explain: 'deprecated-sse',
        // Guided (not auto): the edit is deterministic but the server may not speak Streamable HTTP yet.
        autofix: { kind: 'rewrite-transport', server: name, from: 'sse', to: 'streamable-http' },
      });
    }
  }
  return findings;
}

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
        explain: 'unpinned-latest',
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
        explain: 'pin-integrity',
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
          const envName = key.toUpperCase().replace(/[^A-Z0-9]/g, '_');
          const suggestedRef = `\${env:${envName}}`;
          findings.push({
            severity: 'error',
            file,
            where: `servers.${name}.${kind}.${key}`,
            message: `"${key}" in server "${name}" looks like a hardcoded secret value.`,
            fix: `Replace the literal with a reference, e.g. "${suggestedRef}".`,
            explain: 'hardcoded-secret',
            // Guided repair (S25.3): moving the value needs a provider choice, so this is not
            // auto-applied under `--yes`. The descriptor carries where the value lives + the default ref.
            autofix: { kind: 'extract-secret', server: name, field: kind, key, suggestedRef },
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
          explain: 'unknown-secret-scheme',
        });
      }
    }
  }
  return findings;
}

/**
 * Native-env fallback explainer (S19.4). The `native-env` strategy only works for `${env:...}` refs —
 * a server that opts in but uses a non-env scheme (infisical/keychain/op/dotenv) is silently and
 * safely folded via the `mcpfold run` shim instead, since the client can't resolve those. This
 * surfaces that as an `info` finding so the behavior is explained, not mysterious.
 */
export function checkNativeEnvFallback(config: Config, file: string): Finding[] {
  const findings: Finding[] = [];
  const hasNonEnv = (server: (typeof config.servers)[string]): boolean =>
    findSecretRefs(server).some((r) => r.scheme !== 'env');
  const explain = (name: string, where: string): void => {
    findings.push({
      severity: 'info',
      file,
      where,
      message: `Server "${name}" requests native-env but uses a non-env secret scheme the client can't resolve — it folds via the \`mcpfold run\` shim instead (safe, automatic).`,
      fix: `Nothing required. To fold shim-free, use only \${env:...} refs on native-env servers; or set this server's secretStrategy to "shim" to make the choice explicit.`,
      explain: 'native-env-fallback',
    });
  };
  // Per-server native-env opt-in with a non-env scheme.
  for (const [name, server] of Object.entries(config.servers)) {
    if (server.secretStrategy === 'native-env' && hasNonEnv(server))
      explain(name, `servers.${name}`);
  }
  // Per-profile native-env: any matched server with a non-env scheme that didn't set its own override.
  for (const [pname, profile] of Object.entries(config.profiles)) {
    if (profile.secretStrategy !== 'native-env') continue;
    for (const [name, server] of Object.entries(config.servers)) {
      if (server.secretStrategy) continue; // its own override already governs it (handled above)
      if (!server.tags.some((t) => profile.include.includes(t))) continue;
      if (hasNonEnv(server)) explain(name, `profiles.${pname} → servers.${name}`);
    }
  }
  return findings;
}
