// Unit tests for the crypto + code primitives — no database required.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { signJwt, verifyJwt } from "../lib/jwt.ts";
import { generateDeviceCode, generateUserCode, type RandomBytes, sha256Hex } from "../lib/codes.ts";

const SECRET = "test-jwt-secret-at-least-32-chars-long-000";

Deno.test("signJwt → verifyJwt round-trips the payload", async () => {
  const now = 1_700_000_000;
  const token = await signJwt(
    { sub: "user-1", iat: now, exp: now + 3600, role: "authenticated" },
    SECRET,
  );
  const payload = await verifyJwt(token, SECRET, now + 10);
  assert(payload);
  assertEquals(payload.sub, "user-1");
  assertEquals(payload.role, "authenticated");
});

Deno.test("verifyJwt rejects a tampered signature", async () => {
  const now = 1_700_000_000;
  const token = await signJwt({ sub: "u", iat: now, exp: now + 3600 }, SECRET);
  const tampered = token.slice(0, -2) + (token.endsWith("aa") ? "bb" : "aa");
  assertEquals(await verifyJwt(tampered, SECRET, now + 10), null);
});

Deno.test("verifyJwt rejects a token signed with the wrong secret", async () => {
  const now = 1_700_000_000;
  const token = await signJwt({ sub: "u", iat: now, exp: now + 3600 }, SECRET);
  assertEquals(await verifyJwt(token, "a-different-secret-value-32-chars-xx", now + 10), null);
});

Deno.test("verifyJwt rejects an expired token", async () => {
  const now = 1_700_000_000;
  const token = await signJwt({ sub: "u", iat: now, exp: now + 60 }, SECRET);
  assertEquals(await verifyJwt(token, SECRET, now + 61), null);
  assert(await verifyJwt(token, SECRET, now + 59));
});

Deno.test("generateUserCode is XXXX-XXXX from the unambiguous alphabet", () => {
  const code = generateUserCode();
  assertMatch(code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
  // Never contains the ambiguous characters 0 O 1 I L.
  assert(!/[01OIL]/.test(code));
});

Deno.test("code generators are deterministic under an injected byte source", () => {
  const fixed: RandomBytes = (n) => new Uint8Array(n).fill(7);
  assertEquals(generateUserCode(fixed), generateUserCode(fixed));
  assertEquals(generateDeviceCode(fixed), generateDeviceCode(fixed));
});

Deno.test("generateDeviceCode is a 43-char base64url secret (32 bytes)", () => {
  const code = generateDeviceCode();
  assertEquals(code.length, 43);
  assertMatch(code, /^[A-Za-z0-9_-]+$/);
});

Deno.test("sha256Hex matches the known vector for 'abc'", async () => {
  assertEquals(
    await sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});
