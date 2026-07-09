/**
 * Entitlement checks (S14.3 stub → S20.2 real). Team cloud features are commercially gated by a
 * Stripe subscription per team. The billing webhook (functions/billing) maintains an RLS-protected
 * `public.entitlements` row per team; this module reads it and resolves the tier.
 *
 * Fail-closed-to-FREE: a team with no entitlement row, an inactive/unknown subscription, or any read
 * error resolves to `cloud-free` — never `team`. (The old stub granted `team` to everyone; that
 * grant is gone.) The OSS CLI is never gated — entitlements live only in the cloud edge/web surface.
 */

import type { Sql } from "./device.ts";

export type Tier = "oss" | "cloud-free" | "team" | "enterprise";
export type Entitlement = "team-config" | "audit-trail" | "sso";

/** Which tier grants which entitlements. */
const TIER_ENTITLEMENTS: Record<Tier, Entitlement[]> = {
  oss: [],
  "cloud-free": [],
  team: ["team-config", "audit-trail"],
  enterprise: ["team-config", "audit-trail", "sso"],
};

/** The tier a team falls back to when nothing grants it more (never `team`). */
export const DEFAULT_TIER: Tier = "cloud-free";

/** Subscription statuses that keep a paid tier live (Stripe's active-ish set). */
const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

export interface EntitlementChecker {
  /** The tier a team is currently on (from stored billing state); fail-closed to `cloud-free`. */
  tierFor(teamId: string): Promise<Tier>;
}

/**
 * The real checker: reads `public.entitlements` (via the privileged connection — the webhook is the
 * only writer, and reads here are for server-side enforcement) and returns the stored tier only
 * while the subscription status is active-ish. Anything else → `cloud-free`.
 */
export function dbEntitlementChecker(sql: Sql): EntitlementChecker {
  return {
    async tierFor(teamId: string): Promise<Tier> {
      try {
        const rows = await sql`
          select tier, status from public.entitlements where team_id = ${teamId}
        `;
        const row = rows[0] as { tier?: string; status?: string } | undefined;
        if (!row || !row.tier) return DEFAULT_TIER;
        if (!ACTIVE_STATUSES.has(row.status ?? "")) return DEFAULT_TIER;
        if (row.tier === "team" || row.tier === "enterprise") return row.tier;
        return DEFAULT_TIER;
      } catch {
        return DEFAULT_TIER; // fail closed
      }
    },
  };
}

/**
 * A fixed-tier checker for tests and for the free preview default. NOTE: unlike the removed stub,
 * this defaults to `cloud-free`, so "no billing configured" gates paid features rather than granting
 * them.
 */
export function fixedEntitlementChecker(tier: Tier = DEFAULT_TIER): EntitlementChecker {
  return { tierFor: () => Promise.resolve(tier) };
}

export async function hasEntitlement(
  checker: EntitlementChecker,
  teamId: string,
  entitlement: Entitlement,
): Promise<boolean> {
  const tier = await checker.tierFor(teamId);
  return TIER_ENTITLEMENTS[tier].includes(entitlement);
}

/** Throwing guard for handlers: rejects (for a 402) when the team lacks the entitlement. */
export async function requireEntitlement(
  checker: EntitlementChecker,
  teamId: string,
  entitlement: Entitlement,
): Promise<void> {
  if (!(await hasEntitlement(checker, teamId, entitlement))) {
    throw new EntitlementError(entitlement);
  }
}

/** Raised by {@link requireEntitlement}; handlers map it to a 402 Payment Required. */
export class EntitlementError extends Error {
  constructor(public readonly entitlement: Entitlement) {
    super(`missing entitlement: ${entitlement}`);
    this.name = "EntitlementError";
  }
}
