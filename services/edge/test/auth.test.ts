// Integration test for the device-code OAuth edge function against a live Postgres (the CI
// Supabase database from supabase/docker-compose.ci.yml, with migrations applied). Skipped
// automatically when DATABASE_URL is unset so `deno task test:unit` stays DB-free.
//
//   docker compose -f supabase/docker-compose.ci.yml up -d --wait
//   DATABASE_URL=postgres://postgres:postgres@localhost:54322/postgres \
//     bash supabase/scripts/migrate.sh
//   DATABASE_URL=postgres://postgres:postgres@localhost:54322/postgres \
//     JWT_SECRET=test-jwt-secret-at-least-32-chars-long-000 \
//     deno test --allow-net --allow-env services/edge

import { assert, assertEquals } from "jsr:@std/assert@1";
import postgres from "postgres";
import { createHandler } from "../functions/auth-device/index.ts";
import { DEFAULT_CONFIG, type DeviceAuthConfig } from "../lib/device.ts";
import { signJwt, verifyJwt } from "../lib/jwt.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL");
const JWT_SECRET = Deno.env.get("JWT_SECRET") ?? "test-jwt-secret-at-least-32-chars-long-000";

const cfg: DeviceAuthConfig = {
  ...DEFAULT_CONFIG,
  jwtSecret: JWT_SECRET,
  siteUrl: "https://mcpfold.com",
};

function post(
  handler: (r: Request) => Promise<Response>,
  route: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return handler(
    new Request(`http://edge/auth-device/${route}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}

Deno.test({
  name: "device-code OAuth round trip (start → approve → poll → refresh)",
  ignore: !DATABASE_URL,
  async fn(t) {
    const sql = postgres(DATABASE_URL!, { prepare: false });
    const userId = crypto.randomUUID();
    const email = `edge-test-${userId.slice(0, 8)}@test`;

    // Seed the approving user (auth.users stub + public.users), as the trusted owner.
    await sql`insert into auth.users (id, email) values (${userId}, ${email}) on conflict do nothing`;
    await sql`insert into public.users (id, email) values (${userId}, ${email}) on conflict do nothing`;

    const handler = createHandler({ sql, cfg });
    // A bearer token exactly like GoTrue would issue for the signed-in browser user.
    const iat = Math.floor(Date.now() / 1000);
    const approverJwt = await signJwt(
      { sub: userId, iat, exp: iat + 3600, role: "authenticated", aud: "authenticated" },
      JWT_SECRET,
    );

    let deviceCode = "";
    let userCode = "";
    let refreshToken = "";
    const createdUserCodes: string[] = [];

    try {
      await t.step("start issues a device_code + user_code + verification URL", async () => {
        const res = await post(handler, "start", { machine_name: "test-laptop" });
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.user_code.length, 9); // XXXX-XXXX
        assertEquals(data.verification_uri, "https://mcpfold.com/auth/device");
        assert(data.verification_uri_complete.includes(encodeURIComponent(data.user_code)));
        assertEquals(data.interval, DEFAULT_CONFIG.pollIntervalSeconds);
        assert(data.device_code.length >= 40);
        deviceCode = data.device_code;
        userCode = data.user_code;
        createdUserCodes.push(userCode);
      });

      await t.step("poll before approval returns authorization_pending", async () => {
        const res = await post(handler, "poll", { device_code: deviceCode });
        assertEquals(res.status, 400);
        assertEquals((await res.json()).error, "authorization_pending");
      });

      await t.step("approve without a bearer token is rejected 401", async () => {
        const res = await post(handler, "approve", { user_code: userCode });
        assertEquals(res.status, 401);
      });

      await t.step("approve with an invalid bearer token is rejected 401", async () => {
        const res = await post(handler, "approve", { user_code: userCode }, {
          authorization: "Bearer not-a-jwt",
        });
        assertEquals(res.status, 401);
      });

      await t.step("approve with the user's GoTrue JWT binds the request", async () => {
        const res = await post(handler, "approve", { user_code: userCode }, {
          authorization: `Bearer ${approverJwt}`,
        });
        assertEquals(res.status, 200);
        assertEquals((await res.json()).ok, true);
      });

      await t.step("poll after approval returns a valid, correctly-scoped session", async () => {
        const res = await post(handler, "poll", { device_code: deviceCode });
        assertEquals(res.status, 200);
        const data = await res.json();
        assertEquals(data.token_type, "Bearer");
        assertEquals(data.expires_in, cfg.accessTtlSeconds);
        refreshToken = data.refresh_token;
        assert(refreshToken.length >= 40);

        const payload = await verifyJwt(data.access_token, JWT_SECRET);
        assert(payload, "access token must verify against JWT_SECRET");
        assertEquals(payload.sub, userId);
        assertEquals(payload.role, "authenticated");
        assertEquals(payload.aud, "authenticated");
      });

      await t.step("a device code is single-use: a second poll is rejected", async () => {
        const res = await post(handler, "poll", { device_code: deviceCode });
        assertEquals(res.status, 400);
        assertEquals((await res.json()).error, "expired_token");
      });

      await t.step("refresh exchanges the refresh token for a fresh access token", async () => {
        const res = await post(handler, "refresh", { refresh_token: refreshToken });
        assertEquals(res.status, 200);
        const data = await res.json();
        const payload = await verifyJwt(data.access_token, JWT_SECRET);
        assert(payload);
        assertEquals(payload.sub, userId);
      });

      await t.step("an expired device_code is rejected on poll", async () => {
        // Start fresh, then poll through a handler whose clock is past the TTL.
        const start = await (await post(handler, "start", {})).json();
        createdUserCodes.push(start.user_code);
        const future = new Date(Date.now() + (cfg.deviceCodeTtlSeconds + 60) * 1000);
        const futureHandler = createHandler({ sql, cfg, now: () => future });
        const res = await post(futureHandler, "poll", { device_code: start.device_code });
        assertEquals(res.status, 400);
        assertEquals((await res.json()).error, "expired_token");
      });

      await t.step("approving an unknown user_code returns 404", async () => {
        const res = await post(handler, "approve", { user_code: "ZZZZ-ZZZZ" }, {
          authorization: `Bearer ${approverJwt}`,
        });
        assertEquals(res.status, 404);
      });
    } finally {
      await sql`delete from public.sessions where user_id = ${userId}`;
      if (createdUserCodes.length > 0) {
        await sql`delete from public.device_codes where user_code in ${sql(createdUserCodes)}`;
      }
      await sql`delete from public.users where id = ${userId}`;
      await sql`delete from auth.users where id = ${userId}`;
      await sql.end();
    }
  },
});
