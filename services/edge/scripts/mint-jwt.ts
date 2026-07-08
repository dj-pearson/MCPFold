// Mint a GoTrue-shaped access token for the container smoke test (S6.5). Signs with JWT_SECRET,
// exactly as the auth edge function would. Usage: deno run --allow-env scripts/mint-jwt.ts [sub]
import { signJwt } from "../lib/jwt.ts";

const secret = Deno.env.get("JWT_SECRET");
if (!secret) {
  console.error("JWT_SECRET must be set");
  Deno.exit(1);
}
const sub = Deno.args[0] ?? crypto.randomUUID();
const iat = Math.floor(Date.now() / 1000);
const token = await signJwt(
  { sub, iat, exp: iat + 3600, role: "authenticated", aud: "authenticated" },
  secret,
);
console.log(token);
