// Integration test for session hardening (S9.5) against the live CI Postgres: refresh-token
// rotation + reuse detection, refresh expiry, per-machine revocation, and poll rate-limiting.
// Skipped when DATABASE_URL is unset.

import { assert, assertEquals } from "jsr:@std/assert@1";
import postgres from "postgres";
import { sha256Hex } from "../lib/codes.ts";
import {
  DEFAULT_CONFIG,
  type DeviceAuthConfig,
  pollDeviceAuth,
  startDeviceAuth,
} from "../lib/device.ts";
import { revokeMachine, rotateRefresh } from "../src/session.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL");
const JWT_SECRET = Deno.env.get("JWT_SECRET") ?? "test-jwt-secret-at-least-32-chars-long-000";
const cfg: DeviceAuthConfig = {
  ...DEFAULT_CONFIG,
  jwtSecret: JWT_SECRET,
  siteUrl: "https://mcpfold.com",
};

Deno.test({
  name: "session hardening: rotation, reuse detection, expiry, revocation, rate-limit (S9.5)",
  ignore: !DATABASE_URL,
  async fn(t) {
    const sql = postgres(DATABASE_URL!, { prepare: false });
    const userId = crypto.randomUUID();
    await sql`insert into auth.users (id, email) values (${userId}, ${
      userId + "@t"
    }) on conflict do nothing`;
    await sql`insert into public.users (id, email) values (${userId}, ${
      userId + "@t"
    }) on conflict do nothing`;

    const seedSession = async (
      rawRefresh: string,
      opts: { machine?: string; family: string; expiresAt: Date },
    ) => {
      await sql`
        insert into public.sessions
          (user_id, refresh_token_hash, machine_name, family_id, created_at, expires_at)
        values
          (${userId}, ${await sha256Hex(rawRefresh)}, ${opts.machine ?? "laptop"}, ${opts.family},
           now(), ${opts.expiresAt})
      `;
    };
    const future = () => new Date(Date.now() + 86_400_000);

    try {
      await t.step("refresh rotates the token; the old token is then reuse-detected", async () => {
        const family = crypto.randomUUID();
        await seedSession("refresh-A", { family, expiresAt: future() });

        const rotated = await rotateRefresh(sql, cfg, { refreshToken: "refresh-A" });
        assert(rotated.ok);
        assert(rotated.access_token.length > 0);
        assert(rotated.refresh_token && rotated.refresh_token !== "refresh-A");
        const newRefresh = rotated.refresh_token;

        // Replaying the OLD (rotated) token trips reuse detection…
        const reuse = await rotateRefresh(sql, cfg, { refreshToken: "refresh-A" });
        assertEquals(reuse.ok, false);
        assertEquals((reuse as { error: string }).error, "reuse_detected");

        // …and the whole family — including the freshly-issued token — is revoked.
        const afterRevoke = await rotateRefresh(sql, cfg, { refreshToken: newRefresh });
        assertEquals(afterRevoke.ok, false);
        assertEquals((afterRevoke as { error: string }).error, "revoked");
      });

      await t.step("an expired refresh token is rejected", async () => {
        await seedSession("refresh-old", {
          family: crypto.randomUUID(),
          expiresAt: new Date(Date.now() - 1000),
        });
        const res = await rotateRefresh(sql, cfg, { refreshToken: "refresh-old" });
        assertEquals(res.ok, false);
        assertEquals((res as { error: string }).error, "expired");
      });

      await t.step("per-machine revocation invalidates that machine's sessions", async () => {
        await seedSession("refresh-desk", {
          machine: "desktop",
          family: crypto.randomUUID(),
          expiresAt: future(),
        });
        const { revoked } = await revokeMachine(sql, { userId, machineName: "desktop" });
        assert(revoked >= 1);
        const res = await rotateRefresh(sql, cfg, { refreshToken: "refresh-desk" });
        assertEquals((res as { error: string }).error, "revoked");
      });

      await t.step("polling faster than the interval returns slow_down", async () => {
        const now = new Date();
        const start = await startDeviceAuth(sql, cfg, { now });
        // First poll records last_polled_at; an immediate second poll is rate-limited.
        const first = await pollDeviceAuth(sql, cfg, { deviceCode: start.device_code, now });
        assertEquals(first.status, "pending");
        const second = await pollDeviceAuth(sql, cfg, { deviceCode: start.device_code, now });
        assertEquals(second.status, "error");
        assertEquals((second as { error: string }).error, "slow_down");
      });
    } finally {
      await sql`delete from public.sessions where user_id = ${userId}`;
      await sql`delete from public.device_codes where user_code is not null and user_id is null`;
      await sql`delete from public.users where id = ${userId}`;
      await sql`delete from auth.users where id = ${userId}`;
      await sql.end();
    }
  },
});
