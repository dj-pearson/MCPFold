// Standalone entry for the auth edge function — the side Docker service (S6.5) runs this;
// the managed Supabase runtime can mount `functions/auth-device` directly. Configuration is
// read from the environment (Coolify / Infisical inject it); no secret is ever committed.

import postgres from "postgres";
import { createHandler } from "./functions/auth-device/index.ts";
import { DEFAULT_CONFIG, type DeviceAuthConfig } from "./lib/device.ts";

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
  const handler = createHandler({ sql, cfg: loadConfig() });
  const port = Number(Deno.env.get("PORT") ?? 8000);
  Deno.serve({ port }, (req) => handler(req));
}
