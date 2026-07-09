// Stripe integration primitives (S20.2). The security-critical part — webhook signature
// verification — is implemented directly against WebCrypto (HMAC-SHA256), NOT the Stripe SDK, so it
// has no dependency surface and is fully unit-testable offline. Outbound calls (Checkout / Portal
// session creation) go through a small injectable client so tests run in mock mode with no live key.

import type { Tier } from "./entitlements.ts";

/** Constant-time comparison of two hex strings (avoids leaking via early-exit timing). */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** HMAC-SHA256(`${timestamp}.${payload}`) as hex — Stripe's `v1` signature scheme. */
export async function computeStripeSignature(
  timestamp: string,
  payload: string,
  secret: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  );
  return toHex(mac);
}

/** Parse a `Stripe-Signature` header (`t=...,v1=...,v1=...`) into its timestamp + v1 signatures. */
function parseSignatureHeader(header: string): { t: string; v1: string[] } {
  let t = "";
  const v1: string[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") t = value;
    else if (key === "v1") v1.push(value);
  }
  return { t, v1 };
}

export interface VerifyStripeOptions {
  /** Reject events older than this many seconds (replay protection). Default 300 (Stripe's own). */
  toleranceSeconds?: number;
  /** Current time in seconds (injectable for tests). */
  nowSeconds?: number;
}

/**
 * Verify a Stripe webhook signature. Returns `true` only when a `v1` signature matches an HMAC of
 * the raw body under `secret` AND the signed timestamp is within tolerance (so a captured request
 * can't be replayed later). This is the exact check `stripe.webhooks.constructEvent` performs.
 */
export async function verifyStripeSignature(
  payload: string,
  signatureHeader: string | null,
  secret: string,
  options: VerifyStripeOptions = {},
): Promise<boolean> {
  if (!signatureHeader || !secret) return false;
  const { t, v1 } = parseSignatureHeader(signatureHeader);
  if (!t || v1.length === 0) return false;

  const tolerance = options.toleranceSeconds ?? 300;
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const ts = Number(t);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > tolerance) return false;

  const expected = await computeStripeSignature(t, payload, secret);
  return v1.some((candidate) => timingSafeEqualHex(candidate, expected));
}

/** Config mapping Stripe price ids → tiers (from the environment; empty in mock mode). */
export interface StripePriceMap {
  team?: string;
  enterprise?: string;
}

/** Resolve a Stripe price id to a mcpfold tier, or `null` if it isn't a known paid price. */
export function tierForPriceId(priceId: string | undefined, prices: StripePriceMap): Tier | null {
  if (!priceId) return null;
  if (prices.enterprise && priceId === prices.enterprise) return "enterprise";
  if (prices.team && priceId === prices.team) return "team";
  return null;
}

/**
 * A minimal Stripe REST client — just the two calls the billing endpoints need. Injectable so the
 * edge tests run entirely in mock mode (a fake client) with no network or live key.
 */
export interface StripeClient {
  /** Create a Checkout session for a team's subscription; returns the hosted URL. */
  createCheckoutSession(input: {
    priceId: string;
    teamId: string;
    customerId?: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string }>;
  /** Create a Billing Portal session to manage an existing subscription; returns the hosted URL. */
  createPortalSession(input: { customerId: string; returnUrl: string }): Promise<{ url: string }>;
}

/** The live Stripe REST client (used when a secret key is configured). */
export function httpStripeClient(secretKey: string): StripeClient {
  const post = async (path: string, form: Record<string, string>): Promise<{ url: string }> => {
    const res = await fetch(`https://api.stripe.com/v1/${path}`, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${secretKey}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(form).toString(),
    });
    if (!res.ok) throw new Error(`stripe ${path} failed: ${res.status}`);
    const body = await res.json() as { url?: string };
    if (!body.url) throw new Error(`stripe ${path} returned no url`);
    return { url: body.url };
  };
  return {
    createCheckoutSession: (i) =>
      post("checkout/sessions", {
        "mode": "subscription",
        "line_items[0][price]": i.priceId,
        "line_items[0][quantity]": "1",
        "success_url": i.successUrl,
        "cancel_url": i.cancelUrl,
        "client_reference_id": i.teamId,
        "subscription_data[metadata][team_id]": i.teamId,
        ...(i.customerId ? { customer: i.customerId } : {}),
      }),
    createPortalSession: (i) =>
      post("billing_portal/sessions", { customer: i.customerId, return_url: i.returnUrl }),
  };
}
