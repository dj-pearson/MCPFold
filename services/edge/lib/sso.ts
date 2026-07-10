// Enterprise SSO identity-linking policy (S20.3).
//
// Self-hosted Supabase runs the OIDC flow in GoTrue (Entra ID / Okta / any OIDC IdP) and records the
// (provider, provider_id) → user mapping in auth.identities. The mcpfold-owned concern is the
// *linking policy*: when an SSO login arrives, may it attach to an EXISTING mcpfold account?
//
// The invariant, and the whole anti-takeover story: an identity is the **(issuer, subject)** pair —
// the only durable, IdP-attested key. A matching email is NEVER sufficient to reuse an account.
// Email is non-unique on our user tables and an attacker can register an IdP account carrying a
// victim's email address (verified or not, at their IdP), so linking by email would hand them the
// victim's teams. We link only when the exact (issuer, subject) is already known; otherwise we
// provision a fresh account. This mirrors — and must be paired with — GoTrue configured to disable
// automatic email-based account linking (see docs/self-hosting.md).

export interface IdpIdentity {
  /** The OIDC issuer (e.g. an Entra tenant or Okta org URL). */
  issuer: string;
  /** The IdP's stable subject id for the user (the `sub` claim) — the durable identity key. */
  subject: string;
  /** The email the IdP asserts. Advisory only — never an identity key. */
  email?: string;
  /** Whether the IdP marked the email verified. Still never sufficient to link. */
  emailVerified?: boolean;
}

/** Whether an account is already bound to this exact (issuer, subject). */
export interface LinkContext {
  bySubject?: { userId: string };
  /** Accounts whose email equals the identity's email (may be several — email is non-unique). */
  byEmail?: { userId: string }[];
}

export type LinkAction =
  | { action: "link"; userId: string; reason: string }
  | { action: "create"; reason: string };

/**
 * Decide how an incoming IdP identity maps to a mcpfold account (S20.3). Link ONLY on a known
 * (issuer, subject); a colliding email — even a "verified" one — is deliberately ignored, which is
 * what prevents email-collision account takeover.
 */
export function resolveIdentityLink(id: IdpIdentity, ctx: LinkContext): LinkAction {
  if (ctx.bySubject) {
    return { action: "link", userId: ctx.bySubject.userId, reason: "known (issuer, subject)" };
  }
  // A new (issuer, subject) → a new account, regardless of how many accounts share this email.
  const collided = (ctx.byEmail?.length ?? 0) > 0;
  return {
    action: "create",
    reason: collided
      ? "new (issuer, subject); email collision ignored (anti-takeover)"
      : "new (issuer, subject)",
  };
}
