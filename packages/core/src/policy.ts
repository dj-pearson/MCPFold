import { parse as parseJsonc, type ParseError } from 'jsonc-parser';
import { z } from 'zod';

/**
 * Org-managed server policy (S18.3). A platform/security team publishes ONE policy file that
 * mcpfold enforces on every developer machine and in CI — so ungoverned MCP servers can't quietly
 * enter any client config mcpfold manages. The policy is a pure allow/deny ruleset evaluated here;
 * discovery (project file → env → machine location) and enforcement at `sync`/`add`/`run`/`scan`
 * live in the CLI, but they all call this one evaluator so the verdict is identical everywhere.
 *
 * Precedence is fixed and non-negotiable: **deny always wins** (over allow, and over local TOFU
 * trust). In `strict` mode a server must additionally match an allow rule or it is denied
 * (allow-list-only); in `permissive` mode only the deny list is enforced.
 */

export const POLICY_VERSION = 1;

/** What a rule matches against: the server name, its launched package, that package's namespace, or its URL. */
export const POLICY_MATCH_KINDS = ['name', 'package', 'namespace', 'url'] as const;
export type PolicyMatchKind = (typeof POLICY_MATCH_KINDS)[number];

export const PolicyRuleSchema = z
  .object({
    match: z.enum(POLICY_MATCH_KINDS),
    /** Glob for name/url; prefix-or-glob for package/namespace. `*` and `?` are wildcards. */
    pattern: z.string().min(1),
    /** Optional human note surfaced in the violation message (rule provenance). */
    reason: z.string().optional(),
  })
  .strict();

export const PolicySchema = z
  .object({
    $schema: z.string().optional(),
    version: z.literal(1),
    /** `strict` = allow-list-only; `permissive` = deny-list-only (default). */
    mode: z.enum(['strict', 'permissive']).default('permissive'),
    allow: z.array(PolicyRuleSchema).default([]),
    deny: z.array(PolicyRuleSchema).default([]),
  })
  .strict();

export type PolicyRule = z.infer<typeof PolicyRuleSchema>;
export type McpfoldPolicy = z.infer<typeof PolicySchema>;

/** The minimal server shape a policy is evaluated against (a subset of ServerConfig + its name). */
export interface PolicyTarget {
  name: string;
  transport?: string;
  command?: string;
  args?: string[];
  url?: string;
}

export interface PolicyDecision {
  allowed: boolean;
  /** The rule that decided the verdict (absent when denied only by strict allow-list absence). */
  rule?: PolicyRule;
  /** Human explanation with provenance (which rule, why). */
  reason: string;
}

const NPX_PACKAGE_FLAGS = new Set(['-y', '--yes', '-p', '--package']);

/** The package spec an npx-style stdio launch resolves (e.g. `@scope/mcp@1.2.3`), or undefined. */
export function launchedPackage(
  target: Pick<PolicyTarget, 'command' | 'args'>,
): string | undefined {
  const args = target.args ?? [];
  const flagIdx = args.findIndex((a) => NPX_PACKAGE_FLAGS.has(a));
  if (flagIdx >= 0 && flagIdx + 1 < args.length) return args[flagIdx + 1];
  if (target.command && /npx(\.cmd|\.exe)?$/i.test(target.command)) {
    return args.find((a) => !a.startsWith('-'));
  }
  return undefined;
}

/** Strip a trailing `@version` from a spec, preserving a leading scope `@`. */
function stripVersion(spec: string): string {
  const at = spec.lastIndexOf('@');
  return at > 0 ? spec.slice(0, at) : spec;
}

/** The namespace of a launched package: the scope of `@scope/name`, or the `ns` of `ns/name`. */
export function launchedNamespace(
  target: Pick<PolicyTarget, 'command' | 'args'>,
): string | undefined {
  const pkg = launchedPackage(target);
  if (!pkg) return undefined;
  const bare = stripVersion(pkg);
  const slash = bare.indexOf('/');
  if (slash > 0) return bare.slice(0, slash); // @scope/name → @scope ; ns/name → ns
  return bare.startsWith('@') ? bare : undefined;
}

/** Anchored glob → RegExp: `*` matches any run, `?` one char, everything else literal. */
function globToRegExp(pattern: string): RegExp {
  let out = '';
  for (const ch of pattern) {
    if (ch === '*') out += '.*';
    else if (ch === '?') out += '.';
    else out += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

function ruleMatches(rule: PolicyRule, target: PolicyTarget): boolean {
  switch (rule.match) {
    case 'name':
      return globToRegExp(rule.pattern).test(target.name);
    case 'url':
      return typeof target.url === 'string' && globToRegExp(rule.pattern).test(target.url);
    case 'package': {
      const pkg = launchedPackage(target);
      return (
        typeof pkg === 'string' &&
        (pkg.startsWith(rule.pattern) || globToRegExp(rule.pattern).test(pkg))
      );
    }
    case 'namespace': {
      const ns = launchedNamespace(target);
      return (
        typeof ns === 'string' &&
        (ns === rule.pattern || ns.startsWith(rule.pattern) || globToRegExp(rule.pattern).test(ns))
      );
    }
  }
}

function describe(rule: PolicyRule): string {
  const base = `${rule.match} rule "${rule.pattern}"`;
  return rule.reason ? `${base} (${rule.reason})` : base;
}

/**
 * Evaluate one server against a policy. Deny wins; then strict mode requires an allow match;
 * otherwise permit. The decision carries the deciding rule and a provenance-bearing reason.
 */
export function evaluatePolicy(target: PolicyTarget, policy: McpfoldPolicy): PolicyDecision {
  const denied = policy.deny.find((r) => ruleMatches(r, target));
  if (denied) {
    return { allowed: false, rule: denied, reason: `denied by ${describe(denied)}` };
  }
  if (policy.mode === 'strict') {
    const allowed = policy.allow.find((r) => ruleMatches(r, target));
    if (allowed) return { allowed: true, rule: allowed, reason: `allowed by ${describe(allowed)}` };
    return {
      allowed: false,
      reason: `"${target.name}" is not in the allow-list (strict policy, no matching allow rule)`,
    };
  }
  return { allowed: true, reason: 'permitted (no deny rule matched)' };
}

export interface ParsePolicyResult {
  ok: boolean;
  policy?: McpfoldPolicy;
  error?: string;
}

/** Parse + validate raw policy JSON/JSONC, returning a discriminated result (never throws). */
export function parsePolicy(text: string): ParsePolicyResult {
  const errors: ParseError[] = [];
  const raw = parseJsonc(text, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length > 0 || raw === undefined) {
    return { ok: false, error: 'policy is not valid JSON/JSONC' };
  }
  const result = PolicySchema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first?.path.join('.') || '(root)';
    return { ok: false, error: `invalid policy at ${path}: ${first?.message ?? 'unknown error'}` };
  }
  return { ok: true, policy: result.data };
}
