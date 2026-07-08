// Unit tests for the push config validator + ref-only guard — no database required.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { findRawSecrets, validateConfigForPush } from "../lib/refguard.ts";

const VALID = {
  version: 1,
  servers: {
    github: {
      transport: "http",
      url: "https://api.github.com/mcp",
      auth: { type: "bearer", token: "${env:GH_PAT}" },
    },
    local: { transport: "stdio", command: "npx" },
  },
  profiles: {},
};

Deno.test("a ref-only config validates", () => {
  assertEquals(validateConfigForPush(VALID), null);
});

Deno.test("a literal auth.token is rejected as raw_secret", () => {
  const bad = structuredClone(VALID);
  bad.servers.github.auth.token = "plain-token-value";
  assertEquals(validateConfigForPush(bad)?.code, "raw_secret");
});

Deno.test("a raw provider token anywhere is caught", () => {
  const bad = structuredClone(VALID);
  // A recognizable GitHub PAT hidden in env, not in auth.token.
  (bad.servers.local as Record<string, unknown>).env = { X: "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123" };
  assertEquals(validateConfigForPush(bad)?.code, "raw_secret");
  assert(findRawSecrets(bad).length > 0);
});

Deno.test("structural violations are reported", () => {
  assertEquals(
    validateConfigForPush({ version: 2, servers: {}, profiles: {} })?.code,
    "invalid_config",
  );
  assertEquals(validateConfigForPush({ version: 1, profiles: {} })?.code, "invalid_config");
  assertEquals(
    validateConfigForPush({ version: 1, servers: { a: { transport: "http" } }, profiles: {} })
      ?.code,
    "invalid_config",
  );
  assertEquals(
    validateConfigForPush({ version: 1, servers: { a: { transport: "stdio" } }, profiles: {} })
      ?.code,
    "invalid_config",
  );
});

Deno.test("findRawSecrets ignores references and ordinary strings", () => {
  assertEquals(findRawSecrets(VALID), []);
});
