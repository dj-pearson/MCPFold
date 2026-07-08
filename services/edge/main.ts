// Standalone entry for the auth edge function — the side Docker service (S6.5) runs this;
// the managed Supabase runtime can mount `functions/auth-device` directly. Configuration is
// read from the environment (Coolify / Infisical inject it); no secret is ever committed.

import postgres from "postgres";
import { createHandler } from "./functions/auth-device/index.ts";
import { createPushHandler } from "./functions/push/index.ts";
import { createPullHandler } from "./functions/pull/index.ts";
import { DEFAULT_CONFIG, type DeviceAuthConfig, type Sql } from "./lib/device.ts";

/** Route a request to the auth / push / pull handlers by its path. */
export function createRouter(sql: Sql, cfg: DeviceAuthConfig): (req: Request) => Promise<Response> {
  const auth = createHandler({ sql, cfg });
  const push = createPushHandler({ sql, cfg });
  const pull = createPullHandler({ sql, cfg });
  return (req) => {
    const path = new URL(req.url).pathname.replace(/\/+$/, "");
    if (path.endsWith("/push")) return push(req);
    if (path.endsWith("/pull")) return pull(req);
    return auth(req);
  };
}

function requireEnv(name: string, fallbacks: string[] = []): string {
  for (const key of [name, ...fallbacks]) {
    const v = Deno.env.get(key);
    if (v) return v;
  }
  throw new Error(`missing required environment variable: ${name}`);
}

export function loadConfig(): DeviceAuthConfig {
  const jwtSecret = requireEnv("JWT_SECRET");
  if (jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters");
  }
  return {
    ...DEFAULT_CONFIG,
    jwtSecret,
    siteUrl: Deno.env.get("SITE_URL") ?? "https://mcpfold.com",
    accessTtlSeconds: Number(Deno.env.get("JWT_EXPIRY") ?? DEFAULT_CONFIG.accessTtlSeconds),
  };
}

if (import.meta.main) {
  const databaseUrl = requireEnv("DATABASE_URL", ["SUPABASE_DB_URL"]);
  const sql = postgres(databaseUrl, { prepare: false });
  const router = createRouter(sql, loadConfig());
  const port = Number(Deno.env.get("PORT") ?? 8000);
  Deno.serve({ port }, (req) => router(req));
}
