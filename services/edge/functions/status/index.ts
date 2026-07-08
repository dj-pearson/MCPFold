// Sync-status endpoints (S7.5) — feed the web dashboard, RLS-scoped to the caller.
//
//   GET …/machines → { latestVersion, machines: [{ name, lastSeen, lastVersion }] }
//   GET …/history  → [{ version, author, at }]   (recent personal-config versions)

import type { DeviceAuthConfig, Sql } from "../../lib/device.ts";
import { authenticate, json, readJson } from "../../lib/http.ts";
import { asUser } from "../../lib/rls.ts";
import { revokeMachine } from "../../src/session.ts";

export interface StatusDeps {
  sql: Sql;
  cfg: DeviceAuthConfig;
  now?: () => Date;
}

export function createMachinesHandler(deps: StatusDeps): (req: Request) => Promise<Response> {
  const now = deps.now ?? (() => new Date());
  return async (req) => {
    if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
    const userId = await authenticate(req, deps.cfg.jwtSecret, now());
    if (!userId) return json({ error: "unauthorized" }, 401);

    const [machines, latest] = await asUser(deps.sql, userId, async (tx) => {
      const rows = await tx`
        select name, last_seen_at, coalesce(last_pushed_version, 0) as last_version
        from public.machines
        order by last_seen_at desc nulls last
      `;
      const [{ latest }] = await tx`
        select coalesce(max(version), 0) as latest from public.configs where team_id is null
      `;
      return [rows, Number(latest)] as const;
    });

    return json({
      latestVersion: latest,
      machines: machines.map((r) => ({
        name: r.name,
        lastSeen: r.last_seen_at,
        lastVersion: Number(r.last_version),
      })),
    });
  };
}

export function createHistoryHandler(deps: StatusDeps): (req: Request) => Promise<Response> {
  const now = deps.now ?? (() => new Date());
  return async (req) => {
    if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
    const userId = await authenticate(req, deps.cfg.jwtSecret, now());
    if (!userId) return json({ error: "unauthorized" }, 401);

    const rows = await asUser(deps.sql, userId, (tx) =>
      tx`
        select c.version, u.email as author, c.created_at as at
        from public.configs c
        join public.users u on u.id = c.created_by
        where c.team_id is null
        order by c.version desc
        limit 20
      `);

    return json(
      rows.map((r) => ({ version: Number(r.version), author: r.author ?? "", at: r.at })),
    );
  };
}

/** POST …/revoke { machine_name } → revoke all of the caller's sessions for that machine (S9.5). */
export function createRevokeHandler(deps: StatusDeps): (req: Request) => Promise<Response> {
  const now = deps.now ?? (() => new Date());
  return async (req) => {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const at = now();
    const userId = await authenticate(req, deps.cfg.jwtSecret, at);
    if (!userId) return json({ error: "unauthorized" }, 401);

    const body = await readJson(req);
    const machineName = typeof body.machine_name === "string" ? body.machine_name : "";
    if (!machineName) return json({ error: "invalid_request" }, 400);

    const { revoked } = await revokeMachine(deps.sql, { userId, machineName, now: at });
    return json({ revoked });
  };
}
