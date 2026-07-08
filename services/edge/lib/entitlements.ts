/**
 * Entitlement checks (S14.3) — the stubbed billing path. S7.6's team billing gate is currently a
 * UI stub ("paid feature"); this defines the server-side interface it will call once billing is
 * wired. The chosen provider is Stripe (subscription per active team member); until it's integrated,
 * the default checker grants the free tier and lets everything through, so nothing is gated yet.
 *
 * To wire billing later: implement EntitlementChecker against Stripe subscription status (map a
 * team_id → active subscription → tier), and call `requireEntitlement` in the team-config write /
 * member-invite handlers.
 */

export type Tier = "oss" | "cloud-free" | "team" | "enterprise";
export type Entitlement = "team-config" | "audit-trail" | "sso";

/** Which tier grants which entitlements. */
const TIER_ENTITLEMENTS: Record<Tier, Entitlement[]> = {
  oss: [],
  "cloud-free": [],
  team: ["team-config", "audit-trail"],
  enterprise: ["team-config", "audit-trail", "sso"],
};

export interface EntitlementChecker {
  /** The tier a team is currently on (from the billing provider). */
  tierFor(teamId: string): Promise<Tier>;
}

/** Default checker until Stripe is wired: everyone is on the free tier (nothing is gated). */
export const openEntitlementChecker: EntitlementChecker = {
  tierFor: () => Promise.resolve("team"),
};

export async function hasEntitlement(
  checker: EntitlementChecker,
  teamId: string,
  entitlement: Entitlement,
): Promise<boolean> {
  const tier = await checker.tierFor(teamId);
  return TIER_ENTITLEMENTS[tier].includes(entitlement);
}
