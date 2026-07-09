import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  evaluatePolicy,
  parsePolicy,
  UsageError,
  type McpfoldPolicy,
  type PolicyDecision,
  type PolicyTarget,
  type ServerConfig,
} from '@mcpfold/core';
import { realOsContext, type OsContext } from '@mcpfold/adapters';

/**
 * Org-policy discovery + enforcement plumbing (S18.3). Core owns the pure evaluator; this module
 * finds the policy file on disk and offers the two enforcement shapes every command needs: collect
 * violations (for `sync`/`scan` reporting) or refuse outright (for `add`/`run`). Discovery order is
 * project file → `MCPFOLD_POLICY` → machine-managed location; the first one present wins.
 */

export const POLICY_FILENAMES = ['mcp.policy.jsonc', 'mcp.policy.json'] as const;

export interface LoadedPolicy {
  policy: McpfoldPolicy;
  /** Absolute path the policy was loaded from (rule provenance). */
  source: string;
}

/** The per-OS machine-managed policy location an org deploys via MDM/config management. */
export function machinePolicyPath(ctx: OsContext): string {
  if (ctx.platform === 'win32') {
    return join(ctx.env?.PROGRAMDATA || 'C:\\ProgramData', 'mcpfold', 'policy.json');
  }
  if (ctx.platform === 'darwin') {
    return '/Library/Application Support/mcpfold/policy.json';
  }
  return '/etc/mcpfold/policy.json';
}

/** The ordered list of paths discovery probes, most specific first. */
export function policySearchPaths(cwd: string, ctx: OsContext): string[] {
  const paths = POLICY_FILENAMES.map((f) => join(cwd, f));
  const envPath = ctx.env?.MCPFOLD_POLICY;
  if (envPath) paths.push(envPath);
  paths.push(machinePolicyPath(ctx));
  return paths;
}

export interface DiscoverResult {
  loaded?: LoadedPolicy;
  /** Set when a policy file was found but could not be parsed — a hard error, never ignored. */
  error?: string;
}

/** Find and parse the governing policy, or return {} when no policy is configured. */
export function discoverPolicy(cwd: string, ctx: OsContext = realOsContext()): DiscoverResult {
  for (const path of policySearchPaths(cwd, ctx)) {
    if (!existsSync(path)) continue;
    const parsed = parsePolicy(readFileSync(path, 'utf8'));
    if (!parsed.ok) return { error: `Invalid org policy at ${path}: ${parsed.error}` };
    return { loaded: { policy: parsed.policy!, source: path } };
  }
  return {};
}

/** The minimal policy target for a named server. */
export function toPolicyTarget(name: string, server: ServerConfig): PolicyTarget {
  return {
    name,
    transport: server.transport,
    command: server.command,
    args: server.args,
    url: server.url,
  };
}

export interface PolicyViolation {
  server: string;
  decision: PolicyDecision;
  /** Where the governing rule came from (policy file path). */
  source: string;
}

/** Every server in `servers` that the policy denies, with rule provenance. */
export function policyViolations(
  servers: Record<string, ServerConfig>,
  loaded: LoadedPolicy,
): PolicyViolation[] {
  const out: PolicyViolation[] = [];
  for (const [name, server] of Object.entries(servers)) {
    const decision = evaluatePolicy(toPolicyTarget(name, server), loaded.policy);
    if (!decision.allowed) out.push({ server: name, decision, source: loaded.source });
  }
  return out;
}

/**
 * Refuse a single server if the discovered policy denies it (for `add`/`run`). Deny wins over local
 * trust (S18.3): this is checked independently of the TOFU gate. A no-op when no policy is present.
 */
export function enforceServerPolicy(
  name: string,
  server: ServerConfig,
  cwd: string,
  ctx: OsContext = realOsContext(),
): void {
  const { loaded, error } = discoverPolicy(cwd, ctx);
  if (error) throw new UsageError(error, { hint: 'Fix the policy file or unset MCPFOLD_POLICY.' });
  if (!loaded) return;
  const decision = evaluatePolicy(toPolicyTarget(name, server), loaded.policy);
  if (!decision.allowed) {
    throw new UsageError(`Server "${name}" is blocked by org policy: ${decision.reason}.`, {
      hint: `Policy: ${loaded.source}. Ask your platform team to allow it, or choose a permitted server.`,
    });
  }
}
