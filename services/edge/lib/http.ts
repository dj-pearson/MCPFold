// Small shared HTTP helpers for the edge handlers.
import { verifyJwt } from "./jwt.ts";

/**
 * Security headers on every API response (S9.4). HSTS forces HTTPS for the whole domain (TLS is
 * terminated at the Coolify/Kong edge; see docs/security-at-rest.md). The API returns JSON only,
 * so it also refuses to be sniffed or framed. Full CSP for the web app is S9.6.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...SECURITY_HEADERS },
  });
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return (body && typeof body === "object") ? body as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

/** The final path segment (so handlers work behind either mount prefix). */
export function segment(url: string): string {
  const path = new URL(url).pathname.replace(/\/+$/, "");
  return path.slice(path.lastIndexOf("/") + 1);
}

/** Extract + verify the Bearer access token → user id, or null if missing/invalid/expired. */
export async function authenticate(
  req: Request,
  jwtSecret: string,
  now?: Date,
): Promise<string | null> {
  const match = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const payload = await verifyJwt(
    match[1],
    jwtSecret,
    now ? Math.floor(now.getTime() / 1000) : undefined,
  );
  return payload && typeof payload.sub === "string" ? payload.sub : null;
}
