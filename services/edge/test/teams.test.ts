// Integration test for the team console endpoints (S7.6) against the live CI Postgres. Proves:
// create team → invite member → the member sees the team config while a non-member is denied
// (RLS), the audit trail reports per-version diffs, and removing a member revokes access instantly.

import { assertEquals } from "jsr:@std/assert@1";
import postgres from "postgres";
import { createPushHandler } from "../functions/push/index.ts";
import { createPullHandler } from "../functions/pull/index.ts";
import {
  createTeamAuditHandler,
  createTeamInviteHandler,
  createTeamRemoveHandler,
  createTeamsHandler,
} from "../functions/teams/index.ts";
import { DEFAULT_CONFIG, type DeviceAuthConfig } from "../lib/device.ts";
import { signJwt } from "../lib/jwt.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL");
const JWT_SECRET = Deno.env.get("JWT_SECRET") ?? "test-jwt-secret-at-least-32-chars-long-000";
const cfg: DeviceAuthConfig = {
  ...DEFAULT_CONFIG,
  jwtSecret: JWT_SECRET,
  siteUrl: "https://mcpfold.com",
};

const cfgWith = (servers: string[]) => ({
  version: 1,
  servers: Object.fromEntries(servers.map((n) => [n, { transport: "stdio", command: "npx" }])),
  profiles: {},
});

Deno.test({
  name: "team console: create/invite, member sees config, non-member denied, audit, revoke (S7.6)",
  ignore: !DATABASE_URL,
  async fn(t) {
    const sql = postgres(DATABASE_URL!, { prepare: false });
    const owner = crypto.randomUUID();
    const member = crypto.randomUUID();
    const outsider = crypto.randomUUID();
    const emails: Record<string, string> = {
      [owner]: `owner-${owner.slice(0, 6)}@t`,
      [member]: `member-${member.slice(0, 6)}@t`,
      [outsider]: `out-${outsider.slice(0, 6)}@t`,
    };
    for (const uid of [owner, member, outsider]) {
      await sql`insert into auth.users (id, email) values (${uid}, ${
        emails[uid]
      }) on conflict do nothing`;
      await sql`insert into public.users (id, email) values (${uid}, ${
        emails[uid]
      }) on conflict do nothing`;
    }
    const token = async (uid: string) => {
      const iat = Math.floor(Date.now() / 1000);
      return await signJwt(
        { sub: uid, iat, exp: iat + 3600, role: "authenticated", aud: "authenticated" },
        JWT_SECRET,
      );
    };
    const [tokOwner, tokMember, tokOutsider] = await Promise.all([
      token(owner),
      token(member),
      token(outsider),
    ]);

    const teams = createTeamsHandler({ sql, cfg });
    const invite = createTeamInviteHandler({ sql, cfg });
    const remove = createTeamRemoveHandler({ sql, cfg });
    const audit = createTeamAuditHandler({ sql, cfg });
    const push = createPushHandler({ sql, cfg });
    const pull = createPullHandler({ sql, cfg });

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
    try {
      await t.step("owner creates a team and invites a member", async () => {
        const res = await post(teams, tokOwner, { name: "Acme" });
        assertEquals(res.status, 201);
        teamId = (await res.json()).id;
        const inv = await post(invite, tokOwner, {
          team: teamId,
          email: emails[member],
          role: "member",
        });
        assertEquals(inv.status, 201);
      });

      await t.step("owner pushes two team config versions", async () => {
        assertEquals(
          (await post(push, tokOwner, { config: cfgWith(["github"]), team_id: teamId })).status,
          201,
        );
        assertEquals(
          (await post(push, tokOwner, { config: cfgWith(["github", "gitlab"]), team_id: teamId }))
            .status,
          201,
        );
      });

      await t.step("the member can read the team config (RLS)", async () => {
        const res = await get(pull, tokMember, `?team_id=${teamId}`);
        assertEquals(res.status, 200);
        assertEquals((await res.json()).version, 2);
      });

      await t.step("a non-member cannot read the team config (RLS)", async () => {
        assertEquals((await get(pull, tokOutsider, `?team_id=${teamId}`)).status, 404);
      });

      await t.step("the audit trail reports per-version diffs", async () => {
        const entries = await (await get(audit, tokOwner, `?team=${teamId}`)).json();
        assertEquals(entries.length, 2);
        assertEquals(entries[0].version, 2);
        assertEquals(entries[0].added, ["gitlab"]); // v2 added the gitlab server
        assertEquals(entries[0].author, emails[owner]);
      });

      await t.step("removing the member revokes access immediately", async () => {
        const rm = await post(remove, tokOwner, { team: teamId, user_id: member });
        assertEquals((await rm.json()).removed, 1);
        assertEquals((await get(pull, tokMember, `?team_id=${teamId}`)).status, 404);
      });
    } finally {
      await sql`delete from public.configs where team_id = ${teamId}`;
      await sql`delete from public.team_members where team_id = ${teamId}`;
      await sql`delete from public.teams where id = ${teamId}`;
      await sql`delete from public.users where id in ${sql([owner, member, outsider])}`;
      await sql`delete from auth.users where id in ${sql([owner, member, outsider])}`;
      await sql.end();
    }
  },
});
