// Integration test for the push/pull sync edge functions (S6.4) against the live CI Postgres.
// Proves: config round-trips machine→cloud→machine with refs intact, versions are
// append-only, raw secrets are rejected, cross-tenant reads are denied, and auth is required.
// Skipped when DATABASE_URL is unset.

import { assertEquals } from "jsr:@std/assert@1";
import postgres from "postgres";
import { createPushHandler } from "../functions/push/index.ts";
import { createPullHandler } from "../functions/pull/index.ts";
import { DEFAULT_CONFIG, type DeviceAuthConfig } from "../lib/device.ts";
import { signJwt } from "../lib/jwt.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL");
const JWT_SECRET = Deno.env.get("JWT_SECRET") ?? "test-jwt-secret-at-least-32-chars-long-000";

const cfg: DeviceAuthConfig = {
  ...DEFAULT_CONFIG,
  jwtSecret: JWT_SECRET,
  siteUrl: "https://mcpfold.com",
};

const CONFIG_V1 = {
  version: 1,
  servers: {
    github: {
      transport: "http",
      url: "https://api.github.com/mcp",
      auth: { type: "bearer", token: "${env:GH_PAT}" },
    },
  },
  profiles: {},
};
const CONFIG_V2 = {
  ...CONFIG_V1,
  servers: { ...CONFIG_V1.servers, local: { transport: "stdio", command: "npx" } },
};

async function token(userId: string): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  return await signJwt({
    sub: userId,
    iat,
    exp: iat + 3600,
    role: "authenticated",
    aud: "authenticated",
  }, JWT_SECRET);
}

Deno.test({
  name: "push/pull sync round trip (append-only, refs intact, RLS-scoped)",
  ignore: !DATABASE_URL,
  async fn(t) {
    const sql = postgres(DATABASE_URL!, { prepare: false });
    const userA = crypto.randomUUID();
    const userB = crypto.randomUUID();
    const push = createPushHandler({ sql, cfg });
    const pull = createPullHandler({ sql, cfg });

    for (const uid of [userA, userB]) {
      await sql`insert into auth.users (id, email) values (${uid}, ${
        uid + "@test"
      }) on conflict do nothing`;
      await sql`insert into public.users (id, email) values (${uid}, ${
        uid + "@test"
      }) on conflict do nothing`;
    }
    const tokenA = await token(userA);
    const tokenB = await token(userB);

    const pushReq = (auth: string | null, body: unknown) =>
      push(
        new Request("http://edge/push", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(auth ? { authorization: `Bearer ${auth}` } : {}),
          },
          body: JSON.stringify(body),
        }),
      );
    const pullReq = (auth: string | null, query = "") =>
      pull(
        new Request(`http://edge/pull${query}`, {
          headers: auth ? { authorization: `Bearer ${auth}` } : {},
        }),
      );

    try {
      await t.step("push and pull require authentication", async () => {
        assertEquals((await pushReq(null, { config: CONFIG_V1 })).status, 401);
        assertEquals((await pullReq(null)).status, 401);
      });

      await t.step("push appends version 1, then version 2 (never overwrites)", async () => {
        const r1 = await pushReq(tokenA, { config: CONFIG_V1 });
        assertEquals(r1.status, 201);
        assertEquals((await r1.json()).version, 1);

        const r2 = await pushReq(tokenA, { config: CONFIG_V2 });
        assertEquals(r2.status, 201);
        assertEquals((await r2.json()).version, 2);
      });

      await t.step("pull returns the latest version with the secret ref intact", async () => {
        const res = await pullReq(tokenA);
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.version, 2);
        assertEquals(data.config, CONFIG_V2);
        // The ${env:...} reference survived the round trip unchanged.
        assertEquals(data.config.servers.github.auth.token, "${env:GH_PAT}");
      });

      await t.step("pull can fetch a specific earlier version", async () => {
        const res = await pullReq(tokenA, "?version=1");
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.version, 1);
        assertEquals(data.config, CONFIG_V1);
      });

      await t.step("a config carrying a raw secret is rejected, writing nothing", async () => {
        const leaky = {
          version: 1,
          servers: {
            x: {
              transport: "http",
              url: "https://x",
              auth: { type: "bearer", token: "ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" },
            },
          },
          profiles: {},
        };
        const res = await pushReq(tokenA, { config: leaky });
        assertEquals(res.status, 400);
        assertEquals((await res.json()).error, "raw_secret");
        // Still only the two legitimate versions exist.
        const [{ count }] =
          await sql`select count(*)::int from public.configs where owner_id = ${userA}`;
        assertEquals(count, 2);
      });

      await t.step("cross-tenant: user B cannot pull user A's config", async () => {
        const res = await pullReq(tokenB);
        assertEquals(res.status, 404);
      });

      await t.step("user B's own push/pull is isolated", async () => {
        assertEquals((await pushReq(tokenB, { config: CONFIG_V1 })).status, 201);
        const res = await pullReq(tokenB);
        assertEquals(res.status, 200);
        assertEquals((await res.json()).version, 1);
      });

      await t.step("a version's integrity signature round-trips (S9.2)", async () => {
        const push = await pushReq(tokenA, { config: CONFIG_V2, signature: "sig-abc-123" });
        assertEquals(push.status, 201);
        const pushed = await push.json();
        const res = await pullReq(tokenA, `?version=${pushed.version}`);
        assertEquals((await res.json()).signature, "sig-abc-123");
      });
    } finally {
      await sql`delete from public.configs where owner_id in ${sql([userA, userB])}`;
      await sql`delete from public.users where id in ${sql([userA, userB])}`;
      await sql`delete from auth.users where id in ${sql([userA, userB])}`;
      await sql.end();
    }
  },
});
