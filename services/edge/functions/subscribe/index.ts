// Public newsletter / cloud-waitlist sink (S13.18).
//
// The reusable site email-capture component (apps/site/src/subscribe) posts here. This endpoint is
// UNAUTHENTICATED (a public form) and privacy-friendly by construction:
//   - it collects no PII beyond the email address,
//   - a honeypot field (`website`) silently absorbs bots — filled ⇒ accepted but stored nothing,
//   - rows start `pending` to support a double-opt-in confirmation flow,
//   - it writes on the service connection, so the table stays RLS-locked to everyone else.
import type { Sql } from "../../lib/device.ts";
import { json, readJson } from "../../lib/http.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SubscribeResult =
  | { kind: "bot" }
  | { kind: "invalid" }
  | { kind: "ok"; email: string; source: string | null };

/**
 * Pure validation + bot check (no I/O), so it is unit-testable without a database. The honeypot
 * `website` field is invisible to humans; any value means a bot filled it.
 */
export function parseSubscribe(body: Record<string, unknown>): SubscribeResult {
  if (typeof body.website === "string" && body.website.trim() !== "") return { kind: "bot" };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return { kind: "invalid" };
  const source = typeof body.source === "string" && body.source.length <= 64 ? body.source : null;
  return { kind: "ok", email, source };
}

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

/** Append CORS headers to a response (the form posts cross-origin from mcpfold.com). */
function cors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

export interface SubscribeDeps {
  sql: Sql;
}

export function createSubscribeHandler(deps: SubscribeDeps): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    if (req.method !== "POST") return cors(json({ error: "method_not_allowed" }, 405));

    const parsed = parseSubscribe(await readJson(req));
    // A bot tripped the honeypot: pretend it worked, store nothing.
    if (parsed.kind === "bot") return cors(json({ ok: true }, 202));
    if (parsed.kind === "invalid") return cors(json({ error: "invalid_email" }, 400));

    await deps.sql`
      insert into public.newsletter_subscribers (email, source)
      values (${parsed.email}, ${parsed.source})
      on conflict (email) do nothing
    `;
    // 202 Accepted — a confirmation email completes the double-opt-in (out of scope for the sink).
    return cors(json({ ok: true }, 202));
  };
}
