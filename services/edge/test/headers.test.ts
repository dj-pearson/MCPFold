// Asserts every API response carries the S9.4 security headers (HSTS + anti-sniff/frame).
// No database needed — the health route returns before touching the DB.
import { assertEquals } from "jsr:@std/assert@1";
import { createHandler } from "../functions/auth-device/index.ts";
import { DEFAULT_CONFIG } from "../lib/device.ts";
import { SECURITY_HEADERS } from "../lib/http.ts";

Deno.test("API responses carry HSTS + hardening headers", async () => {
  const handler = createHandler({
    sql: null as never,
    cfg: { ...DEFAULT_CONFIG, jwtSecret: "x".repeat(32), siteUrl: "https://mcpfold.com" },
  });

  const res = await handler(new Request("http://edge/auth-device/health"));
  await res.body?.cancel();
  assertEquals(res.status, 200);
  assertEquals(
    res.headers.get("strict-transport-security"),
    SECURITY_HEADERS["strict-transport-security"],
  );
  assertEquals(res.headers.get("x-content-type-options"), "nosniff");
  assertEquals(res.headers.get("x-frame-options"), "DENY");
  assertEquals(res.headers.get("referrer-policy"), "no-referrer");
});
