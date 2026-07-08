// Small shared HTTP helpers for the edge handlers.
import { verifyJwt } from "./jwt.ts";

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
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
