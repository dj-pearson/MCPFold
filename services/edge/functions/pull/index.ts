// pull edge function (S6.4) — fetch the canonical config (refs intact) for this user/team.
//
//   GET  …/pull?team_id=<uuid>&version=<n>     Authorization: Bearer <access-token>
//   POST …/pull   body: { team_id?: uuid, version?: number }
//     → 200 { version, config, created_at, created_by }   (latest by default)
//     → 404 { error: "not_found" }                        (no config pushed yet)
//
// RLS (S6.2) guarantees the caller only ever sees their own personal config or a config of a
// team they belong to — a cross-tenant pull returns not_found.

import type { DeviceAuthConfig, Sql } from "../../lib/device.ts";
import { authenticate, json, readJson } from "../../lib/http.ts";
import { asUser } from "../../lib/rls.ts";

export interface PullDeps {
  sql: Sql;
  cfg: DeviceAuthConfig;
  now?: () => Date;
}

export function createPullHandler(deps: PullDeps): (req: Request) => Promise<Response> {
  const now = deps.now ?? (() => new Date());
  return async (req: Request): Promise<Response> => {
    if (req.method !== "GET" && req.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }

    const userId = await authenticate(req, deps.cfg.jwtSecret, now());
    if (!userId) return json({ error: "unauthorized" }, 401);

    let teamId: string | null = null;
    let version: number | null = null;
    if (req.method === "GET") {
      const params = new URL(req.url).searchParams;
      teamId = params.get("team_id");
      const v = params.get("version");
      version = v !== null ? Number(v) : null;
    } else {
      const body = await readJson(req);
      teamId = typeof body.team_id === "string" ? body.team_id : null;
      version = typeof body.team_id === "number"
        ? null
        : (typeof body.version === "number" ? body.version : null);
    }
    if (version !== null && (!Number.isInteger(version) || version < 1)) {
      return json({ error: "invalid_request", message: "version must be a positive integer" }, 400);
    }

    try {
      const rows = await asUser(deps.sql, userId, (tx) =>
        version !== null
          ? tx`
              select id, version, config, created_at, created_by
              from public.configs
              where team_id is not distinct from ${teamId} and version = ${version}
              limit 1
            `
          : tx`
              select id, version, config, created_at, created_by
              from public.configs
              where team_id is not distinct from ${teamId}
              order by version desc
              limit 1
            `);
      if (rows.length === 0) return json({ error: "not_found" }, 404);
      const row = rows[0];
      // jsonb comes back parsed or as text depending on the driver path; normalize to an object.
      const config = typeof row.config === "string" ? JSON.parse(row.config) : row.config;
      return json({
        id: row.id,
        version: row.version,
        config,
        created_at: row.created_at,
        created_by: row.created_by,
      }, 200);
    } catch (err) {
      console.error("pull error:", err instanceof Error ? err.message : err);
      return json({ error: "internal_error" }, 500);
    }
  };
}
