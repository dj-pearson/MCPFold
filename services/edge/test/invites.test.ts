// Integration test for pending-invite redemption (S20.3) against the live CI Postgres. Proves:
// invite an email with no account → a hashed, expiring, single-use pending invite; the invitee
// (after signup) redeems it and joins with the invited role; redemption is idempotent, expiry- and
// revoke-enforced, non-transferable (anti-takeover), and every step is audited. Also proves the
// auth.users → public.users provisioning trigger fires on signup.

import { assertEquals } from "jsr:@std/assert@1";
import postgres from "postgres";
import {
  createInviteRedeemHandler,
  createInviteRevokeHandler,
  createPendingInvitesHandler,
  createTeamEventsHandler,
  createTeamInviteHandler,
  createTeamsHandler,
} from "../functions/teams/index.ts";
import { DEFAULT_CONFIG, type DeviceAuthConfig } from "../lib/device.ts";
import { sha256Hex } from "../lib/codes.ts";
import { signJwt } from "../lib/jwt.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL");
const JWT_SECRET = Deno.env.get("JWT_SECRET") ?? "test-jwt-secret-at-least-32-chars-long-000";
const cfg: DeviceAuthConfig = {
  ...DEFAULT_CONFIG,
  jwtSecret: JWT_SECRET,
  siteUrl: "https://mcpfold.com",
};

Deno.test({
  name:
    "pending invites: mint → redeem → join, idempotent, expiry/revoke-enforced, audited (S20.3)",
  ignore: !DATABASE_URL,
  async fn(t) {
    const sql = postgres(DATABASE_URL!, { prepare: false });
    const owner = crypto.randomUUID();
    const invitee = crypto.randomUUID(); // signs up only mid-test
    const stranger = crypto.randomUUID();
    const inviteeEmail = `new-${invitee.slice(0, 6)}@t`;

    // Only the owner has an account up front; the invitee is a bare email.
    await sql`insert into auth.users (id, email) values (${owner}, ${`owner-${
      owner.slice(0, 6)
    }@t`}) on conflict do nothing`;
    await sql`insert into public.users (id, email) values (${owner}, ${`owner-${
      owner.slice(0, 6)
    }@t`}) on conflict do nothing`;
    await sql`insert into auth.users (id, email) values (${stranger}, ${`str-${
      stranger.slice(0, 6)
    }@t`}) on conflict do nothing`;
    await sql`insert into public.users (id, email) values (${stranger}, ${`str-${
      stranger.slice(0, 6)
    }@t`}) on conflict do nothing`;

    const token = async (uid: string) => {
      const iat = Math.floor(Date.now() / 1000);
      return await signJwt({
        sub: uid,
        iat,
        exp: iat + 3600,
        role: "authenticated",
        aud: "authenticated",
      }, JWT_SECRET);
    };
    const [tokOwner, tokStranger] = await Promise.all([token(owner), token(stranger)]);

    const teams = createTeamsHandler({ sql, cfg });
    const invite = createTeamInviteHandler({ sql, cfg });
    const listPending = createPendingInvitesHandler({ sql, cfg });
    const revoke = createInviteRevokeHandler({ sql, cfg });
    const redeem = createInviteRedeemHandler({ sql, cfg });
    const events = createTeamEventsHandler({ sql, cfg });

    const post = (h: (r: Request) => Promise<Response>, tok: string, body: unknown) =>
      h(
        new Request("http://edge/x", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
          body: JSON.stringify(body),
        }),
      );
    const get = (h: (r: Request) => Promise<Response>, tok: string, qs = "") =>
      h(new Request(`http://edge/x${qs}`, { headers: { authorization: `Bearer ${tok}` } }));

    let teamId = "";
    let inviteToken = "";
    try {
      await t.step(
        "owner creates a team and invites an email with no account → pending",
        async () => {
          teamId = (await (await post(teams, tokOwner, { name: "Acme" })).json()).id;
          const res = await post(invite, tokOwner, {
            team: teamId,
            email: inviteeEmail,
            role: "admin",
          });
          assertEquals(res.status, 201);
          const body = await res.json();
          assertEquals(body.pending, true);
          assertEquals(typeof body.token, "string");
          inviteToken = body.token;
          // The raw token is never stored — only its hash.
          const [row] =
            await sql`select token_hash from public.pending_invites where team_id = ${teamId}`;
          assertEquals(row.token_hash, await sha256Hex(inviteToken));
          assertEquals(inviteToken.length > 20 && row.token_hash !== inviteToken, true);
        },
      );

      await t.step("the owner sees the pending invite listed", async () => {
        const list = await (await get(listPending, tokOwner, `?team=${teamId}`)).json();
        assertEquals(list.length, 1);
        assertEquals(list[0].email, inviteeEmail);
        assertEquals(list[0].role, "admin");
      });

      await t.step("signup provisions public.users via the trigger", async () => {
        // GoTrue would create auth.users; the trigger mirrors it into public.users.
        await sql`insert into auth.users (id, email) values (${invitee}, ${inviteeEmail}) on conflict do nothing`;
        const [mirrored] = await sql`select id from public.users where id = ${invitee}`;
        assertEquals(mirrored?.id, invitee);
      });

      await t.step("the invitee redeems the token and joins with the invited role", async () => {
        const res = await post(redeem, await token(invitee), { token: inviteToken });
        assertEquals(res.status, 200);
        const body = await res.json();
        assertEquals(body.teamId, teamId);
        assertEquals(body.role, "admin");
        const [m] =
          await sql`select role from public.team_members where team_id = ${teamId} and user_id = ${invitee}`;
        assertEquals(m.role, "admin");
      });

      await t.step("redemption is idempotent for the same user", async () => {
        const res = await post(redeem, await token(invitee), { token: inviteToken });
        assertEquals(res.status, 200);
        assertEquals((await res.json()).alreadyRedeemed, true);
      });

      await t.step("a redeemed invite no longer lists as pending", async () => {
        assertEquals(
          (await (await get(listPending, tokOwner, `?team=${teamId}`)).json()).length,
          0,
        );
      });

      await t.step(
        "a stranger cannot redeem the already-used token (non-transferable)",
        async () => {
          assertEquals((await post(redeem, tokStranger, { token: inviteToken })).status, 410);
        },
      );

      await t.step("an expired invite cannot be redeemed", async () => {
        const raw = "expired-token-fixture-000000000000000000000";
        await sql`
          insert into public.pending_invites (team_id, email, role, token_hash, invited_by, expires_at)
          values (${teamId}, ${"x@t"}, 'member', ${await sha256Hex(
          raw,
        )}, ${owner}, now() - interval '1 hour')
        `;
        assertEquals((await post(redeem, tokStranger, { token: raw })).status, 410);
      });

      await t.step("a revoked invite cannot be redeemed", async () => {
        const res = await post(invite, tokOwner, {
          team: teamId,
          email: "later@t",
          role: "member",
        });
        const raw2 = (await res.json()).token;
        const [pi] =
          await sql`select id from public.pending_invites where token_hash = ${await sha256Hex(
            raw2,
          )}`;
        assertEquals(
          (await (await post(revoke, tokOwner, { team: teamId, id: pi.id })).json()).revoked,
          1,
        );
        assertEquals((await post(redeem, tokStranger, { token: raw2 })).status, 410);
      });

      await t.step("the audit log records created / redeemed / revoked events", async () => {
        const log = await (await get(events, tokOwner, `?team=${teamId}`)).json();
        const kinds = log.map((e: { event: string }) => e.event);
        assertEquals(kinds.includes("invite.created"), true);
        assertEquals(kinds.includes("invite.redeemed"), true);
        assertEquals(kinds.includes("invite.revoked"), true);
      });
    } finally {
      await sql`delete from public.audit_events where team_id = ${teamId}`;
      await sql`delete from public.pending_invites where team_id = ${teamId}`;
      await sql`delete from public.team_members where team_id = ${teamId}`;
      await sql`delete from public.teams where id = ${teamId}`;
      await sql`delete from public.users where id in ${sql([owner, invitee, stranger])}`;
      await sql`delete from auth.users where id in ${sql([owner, invitee, stranger])}`;
      await sql.end();
    }
  },
});
