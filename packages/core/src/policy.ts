import { z } from 'zod';
import type { ServerConfig } from './types.js';

/**
 * Org-managed server allow/deny policy (S18.3). A platform/security team publishes ONE policy file
 * that mcpfold enforces on every developer machine and in CI — the cross-client governance control
 * the individual clients only offer walled (Claude Code `allowed/deniedMcpServers`, VS Code's
 * registry-restriction MDM policy). It composes with the trust store: policy is org-level *intent*
 * (deny always wins), TOFU stays the per-machine approval.
 *
 * This module is pure: the schema, one shared evaluator, and the matchers. Discovery + I/O (project
 * file → env → machine-managed location) live in the CLI.
 */

/**
 * One rule. A rule matches a server when EVERY matcher it specifies matches (AND) — most rules set
 * exactly one. At least one matcher is required.
 *   - `name`      exact server name
 *   - `package`   npm/stdio package-spec **prefix** (matches the versionless spec, e.g. `left-pad`)
 *   - `namespace` registry namespace, i.e. the `@scope` of a scoped package (e.g. `@modelcontextprotocol`)
 *   - `url`       remote URL **glob** (`*` = any run of characters), whole-string, case-insensitive
 */
export const PolicyRuleSchema = z
  .object({
    name: z.string().optional(),
    package: z.string().optional(),
    namespace: z.string().optional(),
    url: z.string().optional(),
    /** Human-readable reason, surfaced in violation provenance. */
    description: z.string().optional(),
  })
  .strict()
  .refine((r) => Boolean(r.name || r.package || r.namespace || r.url), {
    message: 'a policy rule needs at least one matcher (name/package/namespace/url)',
  });

export const PolicySchema = z
  .object({
    $schema: z.string().optional(),
    version: z.literal(1),
    /**
     * `permissive` (default): a denylist — only servers matching a `deny` rule are blocked, and a
     * violating server is stripped from a fold with a loud warning. `strict`: an allowlist — a
     * server must match an `allow` rule (and no `deny` rule), and any violation hard-fails.
     */
    mode: z.enum(['strict', 'permissive']).default('permissive'),
    allow: z.array(PolicyRuleSchema).default([]),
    deny: z.array(PolicyRuleSchema).default([]),
  })
  .strict();

export type PolicyRule = z.infer<typeof PolicyRuleSchema>;
export type Policy = z.infer<typeof PolicySchema>;

/** Parse + validate a policy document (throws a ZodError on invalid input). */
export function parsePolicy(input: unknown): Policy {
  return PolicySchema.parse(input);
}

// --- Matchers ---------------------------------------------------------------------------------

const RUNNERS = /^(npx|npm|pnpm|yarn|bunx|dlx|uvx|pipx|uv)$/i;

/** Strip a trailing `@version` from a package spec, keeping a leading `@scope`. */
function stripVersion(pkg: string): string {
  const at = pkg.lastIndexOf('@');
  return at > 0 ? pkg.slice(0, at) : pkg; // at===0 is the scope's @, not a version
}

/**
 * The package spec a stdio server launches: for a known runner (`npx -y <pkg>`), the first
 * non-flag argument; otherwise the command itself (e.g. a `uv`/binary launch). `null` for remotes.
 */
export function packageSpecOf(
  server: Pick<ServerConfig, 'transport' | 'command' | 'args'>,
): string | null {
  if (server.transport !== 'stdio') return null;
  const command = server.command ?? '';
  const runner = command.replace(/.*[\\/]/, ''); // basename, so /usr/bin/npx → npx
  if (RUNNERS.test(runner)) {
    for (const arg of server.args ?? []) {
      if (arg.startsWith('-')) continue; // skip -y / --yes / run / exec flags
      if (/^(run|exec|dlx)$/i.test(arg)) continue; // pnpm dlx / yarn exec sub-commands
      return arg;
    }
    return null;
  }
  return command || null;
}

/** The `@scope` namespace of a package spec, or `null` for an unscoped/absent package. */
export function namespaceOf(pkg: string | null): string | null {
  if (!pkg) return null;
  const noVer = stripVersion(pkg);
  if (!noVer.startsWith('@')) return null;
  const slash = noVer.indexOf('/');
  return slash === -1 ? noVer : noVer.slice(0, slash);
}

/** Compile a glob (`*` wildcard) to a whole-string, case-insensitive matcher. */
function globToRe(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

/** Does one rule match this server? (AND over the matchers the rule specifies.) */
export function ruleMatches(
  rule: PolicyRule,
  server: Pick<ServerConfig, 'transport' | 'command' | 'args' | 'url'> & { name: string },
): boolean {
  const pkg = packageSpecOf(server);
  const conditions: boolean[] = [];
  if (rule.name !== undefined) conditions.push(rule.name === server.name);
  if (rule.package !== undefined) {
    conditions.push(
      pkg !== null && (stripVersion(pkg).startsWith(rule.package) || pkg.startsWith(rule.package)),
    );
  }
  if (rule.namespace !== undefined) conditions.push(namespaceOf(pkg) === rule.namespace);
  if (rule.url !== undefined)
    conditions.push(server.url !== undefined && globToRe(rule.url).test(server.url));
  return conditions.length > 0 && conditions.every(Boolean);
}

// --- Evaluation -------------------------------------------------------------------------------

/** Why a server was allowed or denied. `deny` and `not-allowlisted` both mean blocked. */
export type PolicyEffect = 'deny' | 'not-allowlisted' | 'allow' | 'permitted';

export interface PolicyDecision {
  allowed: boolean;
  effect: PolicyEffect;
  /** The rule that decided a `deny`/`allow` (absent for `not-allowlisted`/`permitted`). */
  rule?: PolicyRule;
  /** A one-line, human-readable reason (for provenance messages). */
  reason: string;
}

/**
 * Evaluate a server against a policy. **Deny always wins** (over allow, and over local trust). In
 * `strict` mode a server must additionally match an allow rule; in `permissive` mode anything not
 * denied is permitted.
 */
export function evaluatePolicy(
  policy: Policy,
  server: Pick<ServerConfig, 'transport' | 'command' | 'args' | 'url'> & { name: string },
): PolicyDecision {
  for (const rule of policy.deny) {
    if (ruleMatches(rule, server)) {
      return { allowed: false, effect: 'deny', rule, reason: describeRule('denied by', rule) };
    }
  }
  if (policy.mode === 'strict') {
    for (const rule of policy.allow) {
      if (ruleMatches(rule, server)) {
        return { allowed: true, effect: 'allow', rule, reason: describeRule('allowed by', rule) };
      }
    }
    return {
      allowed: false,
      effect: 'not-allowlisted',
      reason: 'not on the allow-list (strict mode)',
    };
  }
  return { allowed: true, effect: 'permitted', reason: 'no deny rule matched (permissive mode)' };
}

function describeRule(verb: string, rule: PolicyRule): string {
  const matcher = rule.name
    ? `name "${rule.name}"`
    : rule.package
      ? `package "${rule.package}"`
      : rule.namespace
        ? `namespace "${rule.namespace}"`
        : rule.url
          ? `url "${rule.url}"`
          : 'rule';
  return `${verb} ${matcher}${rule.description ? ` (${rule.description})` : ''}`;
}
