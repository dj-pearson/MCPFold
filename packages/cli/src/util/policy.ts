import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseJsonc } from 'jsonc-parser';
import {
  evaluatePolicy,
  parsePolicy,
  type Policy,
  type PolicyDecision,
  type ServerConfig,
} from '@mcpfold/core';
import { realOsContext, type OsContext } from '@mcpfold/adapters';
import { UsageError } from '@mcpfold/core';

/**
 * Org-policy discovery + evaluation for the CLI (S18.3). The policy is found in the first of these
 * locations that exists, and its provenance (which file) travels with every decision:
 *   1. the project file `<cwd>/mcp.policy.jsonc` (or `.json`) — the repo/team-distributed policy
 *   2. `$MCPFOLD_POLICY` — an explicit path (handy in CI)
 *   3. a machine-level managed location (for MDM-distributed org policy), per OS:
 *        win32  %PROGRAMDATA%\mcpfold\mcp.policy.jsonc   (default C:\ProgramData)
 *        darwin /Library/Application Support/mcpfold/mcp.policy.jsonc
 *        linux  /etc/mcpfold/mcp.policy.jsonc
 * With no policy anywhere, mcpfold governs nothing (backwards-compatible).
 */

export const POLICY_FILENAMES = ['mcp.policy.jsonc', 'mcp.policy.json'] as const;

export interface LoadedPolicy {
  policy: Policy;
  /** Absolute path of the policy file in force — the provenance shown in violations. */
  source: string;
}

/** The machine-level managed policy path for an OS (the MDM drop location). */
export function machinePolicyPath(ctx: OsContext): string {
  if (ctx.platform === 'win32') {
    const base = ctx.env.PROGRAMDATA ?? 'C:\\ProgramData';
    return join(base, 'mcpfold', POLICY_FILENAMES[0]);
  }
  if (ctx.platform === 'darwin') {
    return '/Library/Application Support/mcpfold/' + POLICY_FILENAMES[0];
  }
  return '/etc/mcpfold/' + POLICY_FILENAMES[0];
}

/** The ordered candidate policy paths (project → env → machine). */
export function policyCandidates(cwd: string, ctx: OsContext): string[] {
  const candidates: string[] = [];
  for (const name of POLICY_FILENAMES) candidates.push(join(cwd, name));
  const envPath = ctx.env.MCPFOLD_POLICY;
  if (envPath) candidates.push(envPath);
  candidates.push(machinePolicyPath(ctx));
  return candidates;
}

/** Load the policy in force, or `null` if none is present. Throws a coded error on an invalid file. */
export function loadPolicy(cwd: string, ctx: OsContext = realOsContext()): LoadedPolicy | null {
  for (const path of policyCandidates(cwd, ctx)) {
    if (!existsSync(path)) continue;
    let policy: Policy;
    try {
      policy = parsePolicy(parseJsonc(readFileSync(path, 'utf8')));
    } catch (error) {
      throw new UsageError(
        `Invalid policy at ${path}: ${error instanceof Error ? error.message : String(error)}`,
        { hint: 'Fix the policy file, or remove it. See docs/team-config-as-code.md.' },
      );
    }
    return { policy, source: path };
  }
  return null;
}

export interface PolicyViolation {
  server: string;
  decision: PolicyDecision;
  /** The policy file the deciding rule came from. */
  source: string;
}

/** Evaluate one named server; returns a violation record when it is blocked, else `null`. */
export function checkServer(
  loaded: LoadedPolicy | null,
  name: string,
  server: Pick<ServerConfig, 'transport' | 'command' | 'args' | 'url'>,
): PolicyViolation | null {
  if (!loaded) return null;
  const decision = evaluatePolicy(loaded.policy, { name, ...server });
  return decision.allowed ? null : { server: name, decision, source: loaded.source };
}

/** A one-line, provenance-carrying description of a violation (which server, which rule, which file). */
export function describeViolation(v: PolicyViolation): string {
  return `${v.server}: ${v.decision.reason} [policy: ${v.source}]`;
}
