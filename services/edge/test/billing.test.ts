// Billing / entitlements tests (S20.2) — all offline, no live Stripe key, no database. A stateful
// fake `sql` models the two tables so the webhook's idempotency + upsert are exercised for real.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { computeStripeSignature, tierForPriceId, verifyStripeSignature } from "../lib/stripe.ts";
import {
  dbEntitlementChecker,
  fixedEntitlementChecker,
  hasEntitlement,
} from "../lib/entitlements.ts";
import { type BillingConfig, createBillingHandler } from "../functions/billing/index.ts";
import { createTeamInviteHandler } from "../functions/teams/index.ts";
import type { Sql } from "../lib/device.ts";
import { signJwt } from "../lib/jwt.ts";

const SECRET = "test-jwt-secret-at-least-32-chars-long-000";
const WHSEC = "whsec_test_secret_value";

/** A stateful in-memory stand-in for the two billing tables + the owner lookup. */
function fakeDb(
  opts: { owner?: { teamId: string; userId: string; customerId?: string | null } } = {},
) {
  const events = new Set<string>();
  const entitlements = new Map<string, { tier: string; status: string }>();
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const q = strings.join(" ? ").toLowerCase();
    if (q.includes("insert into public.billing_events")) {
      const id = values[0] as string;
      if (events.has(id)) return Promise.resolve([]);
      events.add(id);
      return Promise.resolve([{ event_id: id }]);
    }
    if (q.includes("insert into public.entitlements")) {
      entitlements.set(values[0] as string, {
        tier: values[1] as string,
        status: values[2] as string,
      });
      return Promise.resolve([]);
    }
    if (q.includes("select tier, status from public.entitlements")) {
      const row = entitlements.get(values[0] as string);
      return Promise.resolve(row ? [row] : []);
    }
    if (q.includes("from public.teams t") && q.includes("stripe_customer_id")) {
      const o = opts.owner;
      if (o && values[0] === o.teamId && values[1] === o.userId) {
        return Promise.resolve([{ stripe_customer_id: o.customerId ?? null }]);
      }
      return Promise.resolve([]);
    }
    if (q.includes("select 1 from public.teams where id")) {
      const o = opts.owner;
      return Promise.resolve(o && values[0] === o.teamId ? [{ "?column?": 1 }] : []);
    }
    return Promise.resolve([]);
  }) as unknown as Sql & { begin: <T>(fn: (tx: Sql) => Promise<T>) => Promise<T> };
  // asUser() calls sql.begin; run the callback against the same fake (RLS is not modeled here).
  (sql as unknown as { begin: unknown }).begin = <T>(fn: (tx: Sql) => Promise<T>) => fn(sql);
  return { sql, events, entitlements };
}

const cfg = {
  jwtSecret: SECRET,
  siteUrl: "https://app.mcpfold.test",
  deviceCodeTtlSeconds: 600,
  accessTtlSeconds: 3600,
  refreshTtlSeconds: 60,
  pollIntervalSeconds: 5,
};

const billing: BillingConfig = {
  webhookSecret: WHSEC,
  secretKey: "",
  prices: { team: "price_team_123", enterprise: "price_ent_456" },
};

async function signedRequest(payload: string, tsSeconds: number): Promise<Request> {
  const sig = await computeStripeSignature(String(tsSeconds), payload, WHSEC);
  return new Request("https://edge.test/billing/webhook", {
    method: "POST",
    headers: { "stripe-signature": `t=${tsSeconds},v1=${sig}`, "content-type": "application/json" },
    body: payload,
  });
}

function subscriptionEvent(id: string, teamId: string, priceId: string, status = "active") {
  return JSON.stringify({
    id,
    type: "customer.subscription.created",
    data: {
      object: {
        id: "sub_1",
        status,
        customer: "cus_1",
        current_period_end: 1_800_000_000,
        metadata: { team_id: teamId },
        items: { data: [{ price: { id: priceId } }] },
      },
    },
  });
}

// ---------------------------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------------------------
Deno.test("verifyStripeSignature accepts a correct signature within tolerance", async () => {
  const payload = `{"id":"evt_1"}`;
  const t = 1_700_000_000;
  const sig = await computeStripeSignature(String(t), payload, WHSEC);
  assert(await verifyStripeSignature(payload, `t=${t},v1=${sig}`, WHSEC, { nowSeconds: t + 10 }));
});

Deno.test("verifyStripeSignature rejects a wrong secret, tampered body, and replay", async () => {
  const payload = `{"id":"evt_1"}`;
  const t = 1_700_000_000;
  const sig = await computeStripeSignature(String(t), payload, WHSEC);
  const header = `t=${t},v1=${sig}`;
  // wrong secret
  assertEquals(
    await verifyStripeSignature(payload, header, "whsec_other", { nowSeconds: t }),
    false,
  );
  // tampered payload
  assertEquals(
    await verifyStripeSignature(`{"id":"evt_2"}`, header, WHSEC, { nowSeconds: t }),
    false,
  );
  // replayed outside the tolerance window
  assertEquals(
    await verifyStripeSignature(payload, header, WHSEC, { nowSeconds: t + 10_000 }),
    false,
  );
  // missing / malformed header
  assertEquals(await verifyStripeSignature(payload, null, WHSEC, { nowSeconds: t }), false);
  assertEquals(await verifyStripeSignature(payload, "garbage", WHSEC, { nowSeconds: t }), false);
});

// ---------------------------------------------------------------------------------------------
// Tier resolution
// ---------------------------------------------------------------------------------------------
Deno.test("tierForPriceId maps configured prices, else null", () => {
  const prices = { team: "price_team_123", enterprise: "price_ent_456" };
  assertEquals(tierForPriceId("price_team_123", prices), "team");
  assertEquals(tierForPriceId("price_ent_456", prices), "enterprise");
  assertEquals(tierForPriceId("price_unknown", prices), null);
  assertEquals(tierForPriceId(undefined, prices), null);
});

Deno.test("dbEntitlementChecker fails closed to cloud-free", async () => {
  const { sql, entitlements } = fakeDb();
  const checker = dbEntitlementChecker(sql);
  // no row → free
  assertEquals(await checker.tierFor("team-x"), "cloud-free");
  // active team → team
  entitlements.set("team-x", { tier: "team", status: "active" });
  assertEquals(await checker.tierFor("team-x"), "team");
  // canceled subscription → free (fail closed even though tier says team)
  entitlements.set("team-x", { tier: "team", status: "canceled" });
  assertEquals(await checker.tierFor("team-x"), "cloud-free");
});

Deno.test("entitlements: free tier grants nothing, team grants team-config", async () => {
  assertEquals(
    await hasEntitlement(fixedEntitlementChecker("cloud-free"), "t", "team-config"),
    false,
  );
  assertEquals(await hasEntitlement(fixedEntitlementChecker("team"), "t", "team-config"), true);
  assertEquals(await hasEntitlement(fixedEntitlementChecker("team"), "t", "sso"), false);
  assertEquals(await hasEntitlement(fixedEntitlementChecker("enterprise"), "t", "sso"), true);
});

// ---------------------------------------------------------------------------------------------
// Webhook: signature-gated, idempotent, upserts the tier
// ---------------------------------------------------------------------------------------------
Deno.test("webhook applies a subscription event and is idempotent on replay", async () => {
  const { sql, entitlements } = fakeDb();
  const now = () => new Date(1_700_000_000 * 1000);
  const handler = createBillingHandler({ sql, cfg, billing, now });
  const payload = subscriptionEvent("evt_100", "team-9", "price_team_123");

  const res1 = await handler(await signedRequest(payload, 1_700_000_000));
  assertEquals(res1.status, 200);
  assertEquals((await res1.json()).result, "applied");
  assertEquals(entitlements.get("team-9")?.tier, "team");

  // Re-deliver the SAME event id → duplicate, no re-apply.
  const res2 = await handler(await signedRequest(payload, 1_700_000_000));
  assertEquals((await res2.json()).result, "duplicate");
});

Deno.test("webhook rejects an unsigned / wrongly-signed request", async () => {
  const { sql } = fakeDb();
  const handler = createBillingHandler({
    sql,
    cfg,
    billing,
    now: () => new Date(1_700_000_000 * 1000),
  });
  const bad = new Request("https://edge.test/billing/webhook", {
    method: "POST",
    headers: { "stripe-signature": "t=1700000000,v1=deadbeef", "content-type": "application/json" },
    body: subscriptionEvent("evt_x", "team-9", "price_team_123"),
  });
  const res = await handler(bad);
  assertEquals(res.status, 400);
});

Deno.test("webhook subscription.deleted downgrades the team to cloud-free", async () => {
  const { sql, entitlements } = fakeDb();
  const now = () => new Date(1_700_000_000 * 1000);
  const handler = createBillingHandler({ sql, cfg, billing, now });
  const del = JSON.stringify({
    id: "evt_del",
    type: "customer.subscription.deleted",
    data: {
      object: {
        id: "sub_1",
        status: "canceled",
        customer: "cus_1",
        metadata: { team_id: "team-9" },
        items: { data: [{ price: { id: "price_team_123" } }] },
      },
    },
  });
  await handler(await signedRequest(del, 1_700_000_000));
  assertEquals(entitlements.get("team-9")?.tier, "cloud-free");
});

// ---------------------------------------------------------------------------------------------
// Checkout: owner-gated, returns the Stripe URL from the injected client
// ---------------------------------------------------------------------------------------------
Deno.test("checkout returns a Stripe URL for the team owner (mock client)", async () => {
  const { sql } = fakeDb({ owner: { teamId: "team-9", userId: "user-1", customerId: null } });
  const token = await signJwt({ sub: "user-1", iat: 1_700_000_000, exp: 1_700_003_600 }, SECRET);
  let captured: { priceId: string; teamId: string } | null = null;
  const stripe = {
    createCheckoutSession: (i: { priceId: string; teamId: string }) => {
      captured = { priceId: i.priceId, teamId: i.teamId };
      return Promise.resolve({ url: "https://checkout.stripe.test/session/cs_1" });
    },
    createPortalSession: () => Promise.resolve({ url: "https://portal" }),
  };
  const handler = createBillingHandler({
    sql,
    cfg,
    billing: { ...billing, secretKey: "sk_test" },
    stripe,
    now: () => new Date(1_700_000_000 * 1000),
  });
  const req = new Request("https://edge.test/billing/checkout", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ team: "team-9" }),
  });
  const res = await handler(req);
  assertEquals(res.status, 200);
  assertEquals((await res.json()).url, "https://checkout.stripe.test/session/cs_1");
  assertEquals(captured, { priceId: "price_team_123", teamId: "team-9" });
});

// ---------------------------------------------------------------------------------------------
// Server-side gate: inviting members requires the team-config entitlement (402 on the free tier)
// ---------------------------------------------------------------------------------------------
async function inviteReq(): Promise<Request> {
  const token = await signJwt({ sub: "user-1", iat: 1_700_000_000, exp: 1_700_003_600 }, SECRET);
  return new Request("https://edge.test/team-invite", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ team: "team-9", email: "new@member.test" }),
  });
}

Deno.test("team-invite is 402 on the free tier (gate runs before any DB write)", async () => {
  const { sql } = fakeDb();
  const handler = createTeamInviteHandler({
    sql,
    cfg,
    entitlements: fixedEntitlementChecker("cloud-free"),
    now: () => new Date(1_700_000_000 * 1000),
  });
  const res = await handler(await inviteReq());
  assertEquals(res.status, 402);
  assertEquals((await res.json()).error, "payment_required");
});

Deno.test("team-invite passes the gate on the team tier (then 404s on the missing user)", async () => {
  const { sql } = fakeDb(); // invitee lookup returns [] → user_not_found, proving it cleared the gate
  const handler = createTeamInviteHandler({
    sql,
    cfg,
    entitlements: fixedEntitlementChecker("team"),
    now: () => new Date(1_700_000_000 * 1000),
  });
  const res = await handler(await inviteReq());
  assertEquals(res.status, 404);
  assertEquals((await res.json()).error, "user_not_found");
});

Deno.test("checkout is forbidden for a non-owner", async () => {
  const { sql } = fakeDb({ owner: { teamId: "team-9", userId: "someone-else" } });
  const token = await signJwt({ sub: "user-1", iat: 1_700_000_000, exp: 1_700_003_600 }, SECRET);
  const handler = createBillingHandler({
    sql,
    cfg,
    billing: { ...billing, secretKey: "sk_test" },
    stripe: {
      createCheckoutSession: () => Promise.resolve({ url: "x" }),
      createPortalSession: () => Promise.resolve({ url: "x" }),
    },
    now: () => new Date(1_700_000_000 * 1000),
  });
  const req = new Request("https://edge.test/billing/checkout", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ team: "team-9" }),
  });
  assertEquals((await handler(req)).status, 403);
});
