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
import { generateDeviceCode, sha256Hex } from "../../lib/codes.ts";
import {
  type EntitlementChecker,
  EntitlementError,
  requireEntitlement,
} from "../../lib/entitlements.ts";

/** Pending-invite lifetime: 7 days (S20.3). */
const INVITE_TTL_MS = 60 * 60 * 24 * 7 * 1000;

/**
 * Append a team audit event (S20.3) on the privileged connection (service_role bypasses RLS; there
 * is no authenticated write policy on audit_events by design). Best-effort — a logging failure must
 * never break the action it records.
 */
async function writeAudit(
  sql: Sql,
  teamId: string,
  actorId: string,
  event: string,
  detail: Record<string, unknown>,
): Promise<void> {
  try {
    await sql`
      insert into public.audit_events (team_id, actor_id, event, detail)
      values (${teamId}, ${actorId}, ${event}, ${JSON.stringify(detail)}::jsonb)
    `;
  } catch {
    // Never let an audit write failure surface as a request error.
  }
}

export interface TeamDeps {
  sql: Sql;
  cfg: DeviceAuthConfig;
  /**
   * Server-side billing gate (S20.2). When supplied (the production router always does), adding
   * team members requires the team's `team-config` entitlement — i.e. an active `team`+ subscription.
   * Omitted in unit tests that aren't exercising billing.
   */
  entitlements?: EntitlementChecker;
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

    // S20.2: inviting members is a paid team feature — gate it on the team's entitlement (402 when
    // the team is on the free tier). The upgrade path is Stripe Checkout via …/billing/checkout.
    if (deps.entitlements) {
      try {
        await requireEntitlement(deps.entitlements, teamId, "team-config");
      } catch (e) {
        if (e instanceof EntitlementError) {
          return json({ error: "payment_required", entitlement: e.entitlement }, 402);
        }
        throw e;
      }
    }

    const now = (deps.now ?? (() => new Date()))();
    const [invitee] = await deps.sql`select id from public.users where email = ${email}`;

    // S20.3: no account yet → mint a single-use, expiring, 256-bit pending invite (only its hash is
    // stored). The owner shares the returned token; the invitee redeems it after signing up.
    if (!invitee) {
      const token = generateDeviceCode();
      const tokenHash = await sha256Hex(token);
      const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
      try {
        // RLS (pi_owner_insert) enforces owner-only; a non-owner's insert returns 0 rows.
        const [row] = await asUser(deps.sql, userId, (tx) =>
          tx`
            insert into public.pending_invites (team_id, email, role, token_hash, invited_by, expires_at)
            values (${teamId}, ${email}, ${role}, ${tokenHash}, ${userId}, ${expiresAt})
            returning id
          `);
        if (!row) return json({ error: "forbidden" }, 403);
        await writeAudit(deps.sql, teamId, userId, "invite.created", {
          email,
          role,
          inviteId: row.id,
        });
        return json(
          { ok: true, pending: true, token, expiresAt: Math.floor(expiresAt.getTime() / 1000) },
          201,
        );
      } catch {
        return json({ error: "forbidden" }, 403);
      }
    }

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
      await writeAudit(deps.sql, teamId, userId, "member.added", { userId: invitee.id, role });
      return json({ ok: true, userId: invitee.id, role }, 201);
    } catch {
      return json({ error: "forbidden" }, 403);
    }
  };
}

/** GET …/team-invites ?team=<id> — the team's still-pending invites (owner only, RLS-scoped). */
export function createPendingInvitesHandler(deps: TeamDeps): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
    const userId = await auth(req, deps);
    if (!userId) return json({ error: "unauthorized" }, 401);
    const teamId = new URL(req.url).searchParams.get("team");
    if (!teamId) return json({ error: "invalid_request" }, 400);

    const rows = await asUser(deps.sql, userId, (tx) =>
      tx`
        select id, email, role, created_at, expires_at
        from public.pending_invites
        where team_id = ${teamId} and redeemed_at is null and revoked_at is null
        order by created_at desc
      `);
    return json(
      rows.map((r) => ({
        id: r.id,
        email: r.email,
        role: r.role,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
      })),
    );
  };
}

/** POST …/team-invite-revoke { team, id } — revoke a still-pending invite (owner only). */
export function createInviteRevokeHandler(deps: TeamDeps): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const userId = await auth(req, deps);
    if (!userId) return json({ error: "unauthorized" }, 401);
    const body = await readJson(req);
    const teamId = typeof body.team === "string" ? body.team : "";
    const id = typeof body.id === "string" ? body.id : "";
    if (!teamId || !id) return json({ error: "invalid_request" }, 400);
    const now = (deps.now ?? (() => new Date()))();

    // RLS (pi_owner_update) enforces owner-only; only a still-pending invite is revocable.
    const revoked = await asUser(deps.sql, userId, (tx) =>
      tx`
        update public.pending_invites set revoked_at = ${now}
        where id = ${id} and team_id = ${teamId} and redeemed_at is null and revoked_at is null
        returning email
      `);
    if (revoked.length > 0) {
      await writeAudit(deps.sql, teamId, userId, "invite.revoked", {
        inviteId: id,
        email: revoked[0].email,
      });
    }
    return json({ revoked: revoked.length });
  };
}

/**
 * POST …/team-invite-redeem { token } — redeem a pending invite (S20.3). Authenticated: the caller
 * must be signed in (post-signup). The token hash is the authorization; membership is bound to the
 * caller's **user id**, never the invite email (non-unique) — so a colliding email can't take over.
 * Atomic single-use claim; idempotent for the same user; expiry-enforced.
 */
export function createInviteRedeemHandler(deps: TeamDeps): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const userId = await auth(req, deps);
    if (!userId) return json({ error: "unauthorized" }, 401);
    const body = await readJson(req);
    const token = typeof body.token === "string" ? body.token : "";
    if (!token) return json({ error: "invalid_request" }, 400);
    const now = (deps.now ?? (() => new Date()))();
    const tokenHash = await sha256Hex(token);

    // Atomic claim on the privileged connection — a token-hash lookup needs no team context. Only an
    // unredeemed, unrevoked, unexpired invite is claimable, and only once.
    const [claimed] = await deps.sql`
      update public.pending_invites
      set redeemed_at = ${now}, redeemed_by = ${userId}
      where token_hash = ${tokenHash}
        and redeemed_at is null and revoked_at is null and expires_at > ${now}
      returning id, team_id, email, role
    `;
    if (!claimed) {
      // Idempotent: the same user re-presenting a token they already redeemed succeeds; anyone else,
      // or an expired/revoked/never-existed token, is rejected (single-use, non-transferable).
      const [mine] = await deps.sql`
        select team_id, role from public.pending_invites
        where token_hash = ${tokenHash} and redeemed_by = ${userId}
      `;
      if (mine) {
        return json({ ok: true, teamId: mine.team_id, role: mine.role, alreadyRedeemed: true });
      }
      return json({ error: "invalid_or_expired" }, 410);
    }

    // Bind membership to the AUTHENTICATED user id (service_role insert; the token hash authorized it).
    await deps.sql`
      insert into public.team_members (team_id, user_id, role)
      values (${claimed.team_id}, ${userId}, ${claimed.role})
      on conflict (team_id, user_id) do update set role = ${claimed.role}
    `;
    await writeAudit(deps.sql, claimed.team_id, userId, "invite.redeemed", {
      inviteId: claimed.id,
      email: claimed.email,
    });
    return json({ ok: true, teamId: claimed.team_id, role: claimed.role });
  };
}

/** GET …/team-events ?team=<id> — the team's audit event log (members + owner, RLS-scoped). */
export function createTeamEventsHandler(deps: TeamDeps): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
    const userId = await auth(req, deps);
    if (!userId) return json({ error: "unauthorized" }, 401);
    const teamId = new URL(req.url).searchParams.get("team");
    if (!teamId) return json({ error: "invalid_request" }, 400);

    const rows = await asUser(deps.sql, userId, (tx) =>
      tx`
        select ae.event, u.email as actor, ae.detail, ae.created_at as at
        from public.audit_events ae left join public.users u on u.id = ae.actor_id
        where ae.team_id = ${teamId}
        order by ae.created_at desc
        limit 200
      `);
    return json(
      rows.map((r) => ({ event: r.event, actor: r.actor ?? null, detail: r.detail, at: r.at })),
    );
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
