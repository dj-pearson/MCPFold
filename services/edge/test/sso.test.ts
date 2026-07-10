// SSO identity-linking policy tests (S20.3) — pure, no DB. Proves the anti-takeover invariant: an
// account is reused ONLY on a known (issuer, subject); a colliding email never links.

import { assertEquals } from "jsr:@std/assert@1";
import { resolveIdentityLink } from "../lib/sso.ts";

const entra = "https://login.microsoftonline.com/tenant/v2.0";

Deno.test("SSO: a known (issuer, subject) links to its existing account", () => {
  const decision = resolveIdentityLink(
    { issuer: entra, subject: "sub-abc", email: "alice@corp.com", emailVerified: true },
    { bySubject: { userId: "user-1" } },
  );
  assertEquals(decision.action, "link");
  if (decision.action === "link") assertEquals(decision.userId, "user-1");
});

Deno.test("SSO: a new subject with a COLLIDING email creates a new account (anti-takeover)", () => {
  // Attacker signs in via SSO carrying the victim's email; there IS an account with that email —
  // but a different (issuer, subject). It must NOT link to the victim.
  const decision = resolveIdentityLink(
    { issuer: entra, subject: "attacker-sub", email: "victim@corp.com", emailVerified: true },
    { byEmail: [{ userId: "victim-user" }] },
  );
  assertEquals(decision.action, "create"); // never { action: "link", userId: "victim-user" }
});

Deno.test("SSO: a new subject with no collision creates a new account", () => {
  const decision = resolveIdentityLink(
    { issuer: entra, subject: "fresh-sub", email: "new@corp.com" },
    {},
  );
  assertEquals(decision.action, "create");
});
