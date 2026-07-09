// Stripe billing endpoints (S20.2). Maintains the per-team entitlement state that gates cloud team
// features. Everything is injectable so the edge tests run in mock mode with no live key/network.
//
//   POST …/billing/webhook                 → Stripe webhook: signature-verified, idempotent,
//                                             upserts public.entitlements from subscription events
//   POST …/billing/checkout  { team }       → a Stripe Checkout URL to subscribe a team (owner only)
//   POST …/billing/portal    { team }       → a Billing Portal URL to manage a subscription (owner)
//   GET  …/billing/entitlement ?team=<id>    → the team's current tier (RLS-read, member-visible)

import type { DeviceAuthConfig, Sql } from "../../lib/device.ts";
import { authenticate, json, readJson, segment } from "../../lib/http.ts";
import { asUser } from "../../lib/rls.ts";
import { dbEntitlementChecker, type Tier } from "../../lib/entitlements.ts";
import {
  httpStripeClient,
  type StripeClient,
  type StripePriceMap,
  tierForPriceId,
  verifyStripeSignature,
} from "../../lib/stripe.ts";

export interface BillingConfig {
  /** Stripe webhook signing secret (`whsec_…`). Empty disables the webhook (mock/dev). */
  webhookSecret: string;
  /** Stripe secret key (`sk_…`). Empty → checkout/portal return 501 (mock/dev). */
  secretKey: string;
  prices: StripePriceMap;
}

export interface BillingDeps {
  sql: Sql;
  cfg: DeviceAuthConfig;
  billing: BillingConfig;
  /** Injectable Stripe client (defaults to the live REST client when a secret key is set). */
  stripe?: StripeClient;
  now?: () => Date;
}

/** A Stripe subscription object, narrowed to the fields the webhook reads. */
interface StripeSubscription {
  id: string;
  status: string;
  customer: string;
  current_period_end?: number;
  metadata?: { team_id?: string };
  items?: { data?: Array<{ price?: { id?: string } }> };
}

function tierFromSubscription(sub: StripeSubscription, prices: StripePriceMap): Tier | null {
  const priceId = sub.items?.data?.[0]?.price?.id;
  return tierForPriceId(priceId, prices);
}

/**
 * Handle one verified webhook event. Idempotency is enforced by inserting the Stripe event id into
 * `billing_events` first — a replay (same id) hits the primary-key conflict and is skipped before
 * any entitlement write, so re-delivered events never double-apply.
 */
async function applyEvent(
  deps: BillingDeps,
  event: { id: string; type: string; data: { object: unknown } },
): Promise<"applied" | "duplicate" | "ignored"> {
  const inserted = await deps.sql`
    insert into public.billing_events (event_id, type)
    values (${event.id}, ${event.type})
    on conflict (event_id) do nothing
    returning event_id
  `;
  if (inserted.length === 0) return "duplicate";

  if (!event.type.startsWith("customer.subscription.")) return "ignored";

  const sub = event.data.object as StripeSubscription;
  const teamId = sub.metadata?.team_id;
  if (!teamId) return "ignored";

  const isDeleted = event.type === "customer.subscription.deleted";
  const tier: Tier = isDeleted ? "cloud-free" : (tierFromSubscription(sub, deps.billing.prices) ??
    "cloud-free");
  const status = isDeleted ? "canceled" : sub.status;
  const periodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : null;

  await deps.sql`
    insert into public.entitlements
      (team_id, tier, status, stripe_customer_id, stripe_subscription_id, current_period_end, updated_at)
    values
      (${teamId}, ${tier}, ${status}, ${sub.customer}, ${sub.id}, ${periodEnd}, now())
    on conflict (team_id) do update set
      tier = excluded.tier,
      status = excluded.status,
      stripe_customer_id = excluded.stripe_customer_id,
      stripe_subscription_id = excluded.stripe_subscription_id,
      current_period_end = excluded.current_period_end,
      updated_at = now()
  `;
  return "applied";
}

/** Look up the caller's stored Stripe customer id for a team they own (RLS-scoped). */
async function ownerCustomerId(
  deps: BillingDeps,
  userId: string,
  teamId: string,
): Promise<{ ok: true; customerId: string | null } | { ok: false }> {
  const rows = await asUser(deps.sql, userId, (tx) =>
    tx`
      select e.stripe_customer_id
      from public.teams t
      left join public.entitlements e on e.team_id = t.id
      where t.id = ${teamId} and t.owner_id = ${userId}
    `);
  if (rows.length === 0) return { ok: false }; // not the owner (or no such team) — RLS + owner check
  return { ok: true, customerId: (rows[0].stripe_customer_id as string | null) ?? null };
}

export function createBillingHandler(deps: BillingDeps): (req: Request) => Promise<Response> {
  const now = () => (deps.now ?? (() => new Date()))();
  const checker = dbEntitlementChecker(deps.sql);
  const stripe = deps.stripe ??
    (deps.billing.secretKey ? httpStripeClient(deps.billing.secretKey) : undefined);

  const auth = (req: Request) => authenticate(req, deps.cfg.jwtSecret, now());

  return async (req) => {
    const action = segment(req.url); // webhook | checkout | portal | entitlement

    // --- Webhook: no user auth; authenticity is the Stripe signature. ------------------------------
    if (action === "webhook") {
      if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      if (!deps.billing.webhookSecret) return json({ error: "billing_not_configured" }, 501);
      const payload = await req.text();
      const ok = await verifyStripeSignature(
        payload,
        req.headers.get("stripe-signature"),
        deps.billing.webhookSecret,
        { nowSeconds: Math.floor(now().getTime() / 1000) },
      );
      if (!ok) return json({ error: "invalid_signature" }, 400);
      let event: { id: string; type: string; data: { object: unknown } };
      try {
        event = JSON.parse(payload);
      } catch {
        return json({ error: "invalid_payload" }, 400);
      }
      if (!event.id || !event.type) return json({ error: "invalid_payload" }, 400);
      const result = await applyEvent(deps, event);
      return json({ received: true, result });
    }

    // --- Everything else requires an authenticated user. -------------------------------------------
    const userId = await auth(req);
    if (!userId) return json({ error: "unauthorized" }, 401);

    if (action === "entitlement") {
      if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
      const teamId = new URL(req.url).searchParams.get("team");
      if (!teamId) return json({ error: "invalid_request" }, 400);
      // RLS: only a member can read the team row; a non-member gets an empty result → 403.
      const visible = await asUser(
        deps.sql,
        userId,
        (tx) => tx`select 1 from public.teams where id = ${teamId}`,
      );
      if (visible.length === 0) return json({ error: "forbidden" }, 403);
      const tier = await checker.tierFor(teamId);
      return json({ teamId, tier });
    }

    if (action === "checkout" || action === "portal") {
      if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      const body = await readJson(req);
      const teamId = typeof body.team === "string" ? body.team : "";
      if (!teamId) return json({ error: "invalid_request" }, 400);
      const owner = await ownerCustomerId(deps, userId, teamId);
      if (!owner.ok) return json({ error: "forbidden" }, 403);
      if (!stripe) return json({ error: "billing_not_configured" }, 501);

      const base = deps.cfg.siteUrl.replace(/\/+$/, "");
      if (action === "portal") {
        if (!owner.customerId) return json({ error: "no_subscription" }, 409);
        const { url } = await stripe.createPortalSession({
          customerId: owner.customerId,
          returnUrl: `${base}/teams`,
        });
        return json({ url });
      }
      const priceId = deps.billing.prices.team;
      if (!priceId) return json({ error: "billing_not_configured" }, 501);
      const { url } = await stripe.createCheckoutSession({
        priceId,
        teamId,
        customerId: owner.customerId ?? undefined,
        successUrl: `${base}/teams?upgraded=1`,
        cancelUrl: `${base}/teams`,
      });
      return json({ url });
    }

    return json({ error: "not_found" }, 404);
  };
}
