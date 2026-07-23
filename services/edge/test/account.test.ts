// Unit tests for the DSAR account endpoints (export + delete) — DB-free. A fake `sql` (with the
// `.begin` used by asUser) records queries, and a real signed JWT exercises the auth path. No
// DATABASE_URL needed, so this runs in the fast unit lane.
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  createAccountDeleteHandler,
  createAccountExportHandler,
} from "../functions/account/index.ts";
import { DEFAULT_CONFIG, type DeviceAuthConfig, type Sql } from "../lib/device.ts";
import { signJwt } from "../lib/jwt.ts";

const JWT_SECRET = "test-jwt-secret-at-least-32-chars-long-000";
const cfg: DeviceAuthConfig = {
  ...DEFAULT_CONFIG,
  jwtSecret: JWT_SECRET,
  siteUrl: "https://mcpfold.com",
};
const userId = "11111111-2222-3333-4444-555555555555";

/** Fake tagged-template `sql` with `.begin` (for asUser), recording each query's interpolated values. */
function fakeSql(result: unknown = []): { sql: Sql; calls: unknown[][] } {
  const calls: unknown[][] = [];
  const tag = ((_s: TemplateStringsArray, ...vals: unknown[]) => {
    calls.push(vals);
    return Promise.resolve(result);
  }) as unknown as Sql & { begin: (fn: (tx: Sql) => Promise<unknown>) => Promise<unknown> };
  tag.begin = (fn) => fn(tag);
  return { sql: tag, calls };
}

async function bearer(sub: string): Promise<Record<string, string>> {
  const iat = Math.floor(Date.now() / 1000);
  const token = await signJwt(
    { sub, iat, exp: iat + 3600, role: "authenticated", aud: "authenticated" },
    JWT_SECRET,
  );
  return { authorization: `Bearer ${token}` };
}

Deno.test("account-export: unauthenticated → 401", async () => {
  const { sql } = fakeSql();
  const res = await createAccountExportHandler({ sql, cfg })(
    new Request("http://edge/account-export"),
  );
  assertEquals(res.status, 401);
});

Deno.test("account-export: downloadable JSON copy scoped to the caller", async () => {
  const { sql, calls } = fakeSql();
  const res = await createAccountExportHandler({ sql, cfg })(
    new Request("http://edge/account-export", { headers: await bearer(userId) }),
  );
  assertEquals(res.status, 200);
  assertEquals(
    res.headers.get("content-disposition"),
    'attachment; filename="mcpfold-account-export.json"',
  );
  const body = await res.json();
  assertEquals(body.user_id, userId);
  assert(["profile", "machines", "teams", "configs"].every((k) => k in body));
  assert(calls.some((vals) => vals.includes(userId)), "queries are scoped to the caller");
});

Deno.test("account-export: non-GET → 405", async () => {
  const { sql } = fakeSql();
  const res = await createAccountExportHandler({ sql, cfg })(
    new Request("http://edge/account-export", { method: "POST", headers: await bearer(userId) }),
  );
  assertEquals(res.status, 405);
});

Deno.test("account-delete: unauthenticated → 401 and no delete", async () => {
  const { sql, calls } = fakeSql();
  const res = await createAccountDeleteHandler({ sql, cfg })(
    new Request("http://edge/account-delete", { method: "POST" }),
  );
  assertEquals(res.status, 401);
  assertEquals(calls.length, 0);
});

Deno.test("account-delete: erases the caller's identity and reports it", async () => {
  const { sql, calls } = fakeSql(Object.assign([], { count: 1 }));
  const res = await createAccountDeleteHandler({ sql, cfg })(
    new Request("http://edge/account-delete", { method: "POST", headers: await bearer(userId) }),
  );
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { deleted: true });
  assertEquals(calls.length, 1, "one delete");
  assert(calls[0]!.includes(userId), "deletes the authenticated user");
});

Deno.test("account-delete: idempotent — no row → deleted:false", async () => {
  const { sql } = fakeSql(Object.assign([], { count: 0 }));
  const res = await createAccountDeleteHandler({ sql, cfg })(
    new Request("http://edge/account-delete", { method: "POST", headers: await bearer(userId) }),
  );
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { deleted: false });
});
