// Unit test for the public subscribe sink (S13.18) — DB-free: the honeypot + validation logic is a
// pure function, and the handler is exercised with a fake `sql` that records inserts. No DATABASE_URL
// needed, so it runs in `deno task test:unit`.
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  createSubscribeHandler,
  createUnsubscribeHandler,
  parseSubscribe,
  parseUnsubscribe,
} from "../functions/subscribe/index.ts";
import type { Sql } from "../lib/device.ts";

/** A fake tagged-template `sql` that records the interpolated values of each query. */
function fakeSql(): { sql: Sql; calls: unknown[][] } {
  const calls: unknown[][] = [];
  const sql = ((_strings: TemplateStringsArray, ...vals: unknown[]) => {
    calls.push(vals);
    return Promise.resolve([]);
  }) as unknown as Sql;
  return { sql, calls };
}

function post(body: unknown): Request {
  return new Request("https://api.mcpfold.com/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

Deno.test("parseSubscribe: honeypot, validation, normalization", () => {
  assertEquals(parseSubscribe({ email: "a@b.com", website: "spam" }).kind, "bot");
  assertEquals(parseSubscribe({ email: "not-an-email" }).kind, "invalid");
  assertEquals(parseSubscribe({}).kind, "invalid");
  const ok = parseSubscribe({ email: "  USER@Example.COM ", source: "home" });
  assertEquals(ok.kind, "ok");
  assert(ok.kind === "ok" && ok.email === "user@example.com" && ok.source === "home");
});

Deno.test("handler: valid signup inserts and returns 202", async () => {
  const { sql, calls } = fakeSql();
  const res = await createSubscribeHandler({ sql })(
    post({ email: "new@example.com", source: "home" }),
  );
  assertEquals(res.status, 202);
  assertEquals(await res.json(), { ok: true });
  assertEquals(calls.length, 1, "one insert");
  assert(calls[0]!.includes("new@example.com"), "inserts the normalized email");
  assertEquals(res.headers.get("access-control-allow-origin"), "*");
});

Deno.test("handler: honeypot is silently accepted but stores nothing", async () => {
  const { sql, calls } = fakeSql();
  const res = await createSubscribeHandler({ sql })(
    post({ email: "bot@example.com", website: "x" }),
  );
  assertEquals(res.status, 202);
  assertEquals(calls.length, 0, "no insert for a honeypot hit");
});

Deno.test("handler: invalid email is rejected with 400 and no insert", async () => {
  const { sql, calls } = fakeSql();
  const res = await createSubscribeHandler({ sql })(post({ email: "nope" }));
  assertEquals(res.status, 400);
  assertEquals(calls.length, 0);
});

Deno.test("handler: OPTIONS preflight and non-POST", async () => {
  const { sql } = fakeSql();
  const handler = createSubscribeHandler({ sql });
  const preflight = await handler(
    new Request("https://api.mcpfold.com/subscribe", { method: "OPTIONS" }),
  );
  assertEquals(preflight.status, 204);
  assertEquals(preflight.headers.get("access-control-allow-methods"), "POST, OPTIONS");
  const get = await handler(new Request("https://api.mcpfold.com/subscribe", { method: "GET" }));
  assertEquals(get.status, 405);
});

Deno.test("parseUnsubscribe: token, email, and invalid", () => {
  const id = "11111111-2222-3333-4444-555555555555";
  assertEquals(parseUnsubscribe({ token: id }), { kind: "token", token: id });
  assertEquals(parseUnsubscribe({ email: "  USER@Example.COM " }), {
    kind: "email",
    email: "user@example.com",
  });
  assertEquals(parseUnsubscribe({}).kind, "invalid");
  assertEquals(parseUnsubscribe({ token: "not-a-uuid" }).kind, "invalid");
});

Deno.test("unsubscribe handler: token marks the row unsubscribed → 200", async () => {
  const { sql, calls } = fakeSql();
  const id = "11111111-2222-3333-4444-555555555555";
  const res = await createUnsubscribeHandler({ sql })(post({ token: id }));
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true });
  assertEquals(calls.length, 1, "one update");
  assert(calls[0]!.includes(id), "updates by the subscriber id");
  assertEquals(res.headers.get("access-control-allow-origin"), "*");
});

Deno.test("unsubscribe handler: email path works and invalid is rejected", async () => {
  const { sql, calls } = fakeSql();
  const ok = await createUnsubscribeHandler({ sql })(post({ email: "a@b.com" }));
  assertEquals(ok.status, 200);
  assert(calls[0]!.includes("a@b.com"), "updates by email");
  const bad = await createUnsubscribeHandler({ sql })(post({}));
  assertEquals(bad.status, 400);
  assertEquals(calls.length, 1, "no update for an invalid request");
});
