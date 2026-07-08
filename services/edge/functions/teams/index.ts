// Team management + audit endpoints (S7.6), all RLS-scoped (run AS the user), so a caller only
// ever touches teams they own/belong to — a non-member can neither list nor read a team.
//
//   POST …/teams          { name }                 → create a team (caller = owner)
//   GET  …/teams                                    → the caller's teams
//   GET  …/team-members   ?team=<id>                → roster { userId, email, role }
//   POST …/team-invite    { team, email, role? }    → add an existing user (owner only)
//   POST …/team-remove    { team, user_id }         → remove a member (owner only) — instant
//   GET  …/team-audit     ?team=<id>                → version history + a per-version diff

import type { DeviceAuthConfig, Sql } from "../../lib/device.ts";
import { authenticate, json, readJson } from "../../lib/http.ts";
import { asUser } from "../../lib/rls.ts";

export interface TeamDeps {
  sql: Sql;
  cfg: DeviceAuthConfig;
  now?: () => Date;
}

const auth = (req: Request, deps: TeamDeps): Promise<string | null> =>
  authenticate(req, deps.cfg.jwtSecret, (deps.now ?? (() => new Date()))());

export function createTeamsHandler(deps: TeamDeps): (req: Request) => Promise<Response> {
  return async (req) => {
    const userId = await auth(req, deps);
    if (!userId) return json({ error: "unauthorized" }, 401);

    if (req.method === "GET") {
      const rows = await asUser(
        deps.sql,
        userId,
        (tx) => tx`select id, name, owner_id from public.teams order by created_at`,
      );
      return json(rows.map((r) => ({ id: r.id, name: r.name, isOwner: r.owner_id === userId })));
    }
    if (req.method === "POST") {
      const body = await readJson(req);
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) return json({ error: "invalid_request" }, 400);
      try {
        const id = await asUser(deps.sql, userId, async (tx) => {
          const [team] = await tx`
            insert into public.teams (name, owner_id) values (${name}, ${userId}) returning id
          `;
          await tx`
            insert into public.team_members (team_id, user_id, role)
            values (${team.id}, ${userId}, 'owner')
          `;
          return team.id as string;
        });
        return json({ id, name }, 201);
      } catch {
        return json({ error: "forbidden" }, 403);
      }
    }
    return json({ error: "method_not_allowed" }, 405);
  };
}

export function createTeamMembersHandler(deps: TeamDeps): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
    const userId = await auth(req, deps);
    if (!userId) return json({ error: "unauthorized" }, 401);
    const teamId = new URL(req.url).searchParams.get("team");
    if (!teamId) return json({ error: "invalid_request" }, 400);

    const rows = await asUser(deps.sql, userId, (tx) =>
      tx`
        select tm.user_id, u.email, tm.role
        from public.team_members tm join public.users u on u.id = tm.user_id
        where tm.team_id = ${teamId}
        order by tm.created_at
      `);
    return json(rows.map((r) => ({ userId: r.user_id, email: r.email, role: r.role })));
  };
}

export function createTeamInviteHandler(deps: TeamDeps): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const userId = await auth(req, deps);
    if (!userId) return json({ error: "unauthorized" }, 401);
    const body = await readJson(req);
    const teamId = typeof body.team === "string" ? body.team : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const role = body.role === "admin" || body.role === "member" ? body.role : "member";
    if (!teamId || !email) return json({ error: "invalid_request" }, 400);

    // The invited user must already have an account; a pending-invite flow (S9.6 tokens) is future.
    const [invitee] = await deps.sql`select id from public.users where email = ${email}`;
    if (!invitee) return json({ error: "user_not_found" }, 404);

    try {
      // RLS (tm_owner_insert) enforces that only the team owner may add members.
      const added = await asUser(deps.sql, userId, (tx) =>
        tx`
          insert into public.team_members (team_id, user_id, role)
          values (${teamId}, ${invitee.id}, ${role})
          on conflict (team_id, user_id) do update set role = ${role}
          returning user_id
        `);
      if (added.length === 0) return json({ error: "forbidden" }, 403);
      return json({ ok: true, userId: invitee.id, role }, 201);
    } catch {
      return json({ error: "forbidden" }, 403);
    }
  };
}

export function createTeamRemoveHandler(deps: TeamDeps): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const userId = await auth(req, deps);
    if (!userId) return json({ error: "unauthorized" }, 401);
    const body = await readJson(req);
    const teamId = typeof body.team === "string" ? body.team : "";
    const removeId = typeof body.user_id === "string" ? body.user_id : "";
    if (!teamId || !removeId) return json({ error: "invalid_request" }, 400);

    // RLS (tm_owner_delete) enforces owner-only; removal instantly revokes the member's access.
    const removed = await asUser(deps.sql, userId, (tx) =>
      tx`
        delete from public.team_members where team_id = ${teamId} and user_id = ${removeId}
        returning user_id
      `);
    return json({ removed: removed.length });
  };
}

export function createTeamAuditHandler(deps: TeamDeps): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
    const userId = await auth(req, deps);
    if (!userId) return json({ error: "unauthorized" }, 401);
    const teamId = new URL(req.url).searchParams.get("team");
    if (!teamId) return json({ error: "invalid_request" }, 400);

    // config_audit (RLS-scoped) + the config per version so the client can diff consecutive ones.
    const rows = await asUser(deps.sql, userId, (tx) =>
      tx`
        select c.version, u.email as author, c.created_at as at, c.config
        from public.configs c join public.users u on u.id = c.created_by
        where c.team_id = ${teamId}
        order by c.version desc
      `);

    const serversOf = (cfg: unknown): string[] => {
      const s = (cfg as { servers?: Record<string, unknown> } | null)?.servers;
      return s ? Object.keys(s) : [];
    };
    const entries = rows.map((r, i) => {
      const prev = rows[i + 1]; // next in the desc list is the previous version
      const before = prev
        ? serversOf(typeof prev.config === "string" ? JSON.parse(prev.config) : prev.config)
        : [];
      const after = serversOf(typeof r.config === "string" ? JSON.parse(r.config) : r.config);
      const added = after.filter((n) => !before.includes(n));
      const removed = before.filter((n) => !after.includes(n));
      return { version: Number(r.version), author: r.author ?? "", at: r.at, added, removed };
    });
    return json(entries);
  };
}
