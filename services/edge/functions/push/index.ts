// push edge function (S6.4) — upload the local canonical config as a NEW append-only version.
//
//   POST …/push   Authorization: Bearer <access-token>
//     body: { config: <canonical config, refs only>, team_id?: uuid, machine_name?: string }
//     → 201 { version, id, created_at }
//
// Invariants:
//   - Authenticated: the access token (S6.3) identifies the user; RLS (S6.2) scopes writes.
//   - Config-only: the payload is validated and REJECTED if it carries any raw secret value —
//     only ${scheme:path} references may be synced (mirrors the DB CHECK + CLI guard).
//   - Append-only: a new row is inserted; the DB trigger assigns the next version. Never an
//     overwrite. Conflict strategy is last-write-wins with full version history (pull can diff).

import type { DeviceAuthConfig, Sql } from "../../lib/device.ts";
import { authenticate, json, readJson } from "../../lib/http.ts";
import { asUser } from "../../lib/rls.ts";
import { validateConfigForPush } from "../../lib/refguard.ts";

export interface PushDeps {
  sql: Sql;
  cfg: DeviceAuthConfig;
  now?: () => Date;
}

export function createPushHandler(deps: PushDeps): (req: Request) => Promise<Response> {
  const now = deps.now ?? (() => new Date());
  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const userId = await authenticate(req, deps.cfg.jwtSecret, now());
    if (!userId) return json({ error: "unauthorized" }, 401);

    const body = await readJson(req);
    const config = body.config;
    const teamId = typeof body.team_id === "string" ? body.team_id : null;

    const invalid = validateConfigForPush(config);
    if (invalid) return json({ error: invalid.code, message: invalid.message }, 400);

    try {
      // Insert AS the user so RLS enforces ownership / team membership. The configs_version
      // trigger assigns the next version within the config line.
      const configJson = JSON.stringify(config);
      const rows = await asUser(deps.sql, userId, (tx) =>
        tx`
          insert into public.configs (owner_id, team_id, created_by, config)
          values (${userId}, ${teamId}, ${userId}, ${configJson}::jsonb)
          returning id, version, created_at
        `);
      const row = rows[0];
      return json({ id: row.id, version: row.version, created_at: row.created_at }, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // An RLS denial (e.g. pushing to a team you're not a member of) surfaces as 0 rows /
      // a policy violation → 403; a ref-only CHECK breach → 400; anything else → 500.
      if (/row-level security|permission denied|violates row-level/i.test(message)) {
        return json({ error: "forbidden" }, 403);
      }
      if (/config_is_ref_only|violates check constraint/i.test(message)) {
        return json({ error: "raw_secret" }, 400);
      }
      console.error("push error:", message);
      return json({ error: "internal_error" }, 500);
    }
  };
}
