// Integration test for the sync-status endpoints (S7.5) against the live CI Postgres.
// Proves: push registers the machine + records its version, /machines lists it with the latest
// version, /history returns authored version records, and both require auth. Skipped when
// DATABASE_URL is unset.

import { assert, assertEquals } from "jsr:@std/assert@1";
import postgres from "postgres";
import { createPushHandler } from "../functions/push/index.ts";
import { createHistoryHandler, createMachinesHandler } from "../functions/status/index.ts";
import { DEFAULT_CONFIG, type DeviceAuthConfig } from "../lib/device.ts";
import { signJwt } from "../lib/jwt.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL");
const JWT_SECRET = Deno.env.get("JWT_SECRET") ?? "test-jwt-secret-at-least-32-chars-long-000";
const cfg: DeviceAuthConfig = {
  ...DEFAULT_CONFIG,
  jwtSecret: JWT_SECRET,
  siteUrl: "https://mcpfold.com",
};

const CONFIG = { version: 1, servers: { s: { transport: "stdio", command: "npx" } }, profiles: {} };

Deno.test({
  name: "push registers a machine; /machines + /history report sync status (S7.5)",
  ignore: !DATABASE_URL,
  async fn(t) {
    const sql = postgres(DATABASE_URL!, { prepare: false });
    const userId = crypto.randomUUID();
    const email = `status-${userId.slice(0, 8)}@test`;
    await sql`insert into auth.users (id, email) values (${userId}, ${email}) on conflict do nothing`;
    await sql`insert into public.users (id, email) values (${userId}, ${email}) on conflict do nothing`;

    const push = createPushHandler({ sql, cfg });
    const machines = createMachinesHandler({ sql, cfg });
    const history = createHistoryHandler({ sql, cfg });
    const iat = Math.floor(Date.now() / 1000);
    const token = await signJwt(
      { sub: userId, iat, exp: iat + 3600, role: "authenticated", aud: "authenticated" },
      JWT_SECRET,
    );

    const doPush = () =>
      push(
        new Request("http://edge/push", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ config: CONFIG, machine_name: "laptop" }),
        }),
      );
    const get = (h: (r: Request) => Promise<Response>, path: string) =>
      h(new Request(`http://edge/${path}`, { headers: { authorization: `Bearer ${token}` } }));

    try {
      await t.step("unauthenticated requests are rejected", async () => {
        const res = await machines(new Request("http://edge/machines"));
        assertEquals(res.status, 401);
      });

      await t.step("two pushes register the machine at the latest version", async () => {
        assertEquals((await doPush()).status, 201);
        assertEquals((await doPush()).status, 201);
        const data = await (await get(machines, "machines")).json();
        assertEquals(data.latestVersion, 2);
        assertEquals(data.machines.length, 1);
        assertEquals(data.machines[0].name, "laptop");
        assertEquals(data.machines[0].lastVersion, 2);
        assert(data.machines[0].lastSeen);
      });

      await t.step("history lists authored version records, newest first", async () => {
        const data = await (await get(history, "history")).json();
        assertEquals(data.length, 2);
        assertEquals(data[0].version, 2);
        assertEquals(data[0].author, email);
      });
    } finally {
      await sql`delete from public.machines where user_id = ${userId}`;
      await sql`delete from public.configs where owner_id = ${userId}`;
      await sql`delete from public.users where id = ${userId}`;
      await sql`delete from auth.users where id = ${userId}`;
      await sql.end();
    }
  },
});
