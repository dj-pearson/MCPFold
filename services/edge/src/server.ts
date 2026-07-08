// The side Docker service (S6.5): an HTTP server exposing the same auth / push / pull handlers
// the managed Supabase runtime would mount, so we can host them anywhere Coolify runs a
// container. It shares the exact JWT/RLS contract — every request is authenticated and
// RLS-scoped by the same code paths; the container grants no privilege the functions don't.

import postgres from "postgres";
import { createHandler } from "../functions/auth-device/index.ts";
import { createPushHandler } from "../functions/push/index.ts";
import { createPullHandler } from "../functions/pull/index.ts";
import { createHistoryHandler, createMachinesHandler } from "../functions/status/index.ts";
import { DEFAULT_CONFIG, type DeviceAuthConfig, type Sql } from "../lib/device.ts";
import { json } from "../lib/http.ts";

/** Route a request to health / push / pull / machines / history / auth by its final path segment. */
export function createRouter(sql: Sql, cfg: DeviceAuthConfig): (req: Request) => Promise<Response> {
  const auth = createHandler({ sql, cfg });
  const push = createPushHandler({ sql, cfg });
  const pull = createPullHandler({ sql, cfg });
  const machines = createMachinesHandler({ sql, cfg });
  const history = createHistoryHandler({ sql, cfg });
  return (req) => {
    const path = new URL(req.url).pathname.replace(/\/+$/, "");
    if (path.endsWith("/health") || path === "") {
      return Promise.resolve(json({ ok: true, service: "mcpfold-edge" }));
    }
    if (path.endsWith("/push")) return push(req);
    if (path.endsWith("/pull")) return pull(req);
    if (path.endsWith("/machines")) return machines(req);
    if (path.endsWith("/history")) return history(req);
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

/** Build the runtime config from the environment (Coolify / Infisical inject it). */
export function loadConfig(): DeviceAuthConfig {
  const jwtSecret = requireEnv("JWT_SECRET");
  if (jwtSecret.length < 32) throw new Error("JWT_SECRET must be at least 32 characters");
  return {
    ...DEFAULT_CONFIG,
    jwtSecret,
    siteUrl: Deno.env.get("SITE_URL") ?? "https://mcpfold.com",
    accessTtlSeconds: Number(Deno.env.get("JWT_EXPIRY") ?? DEFAULT_CONFIG.accessTtlSeconds),
  };
}

/**
 * Start the HTTP server with graceful shutdown: on SIGTERM/SIGINT it stops accepting new
 * connections, drains in-flight requests, and closes the DB pool. Resolves when fully stopped.
 */
export async function runServer(): Promise<void> {
  const databaseUrl = requireEnv("DATABASE_URL", ["SUPABASE_DB_URL"]);
  const sql = postgres(databaseUrl, { prepare: false });
  const router = createRouter(sql, loadConfig());
  const port = Number(Deno.env.get("PORT") ?? 8000);

  const server = Deno.serve(
    { port, onListen: ({ port }) => console.log(`mcpfold-edge listening on :${port}`) },
    (req) => router(req),
  );

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("mcpfold-edge shutting down…");
    await server.shutdown();
    await sql.end();
  };
  Deno.addSignalListener("SIGINT", () => void shutdown());
  Deno.addSignalListener("SIGTERM", () => void shutdown());

  await server.finished;
}
