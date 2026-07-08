// HS256 JSON Web Tokens via the built-in Web Crypto API — no third-party dependency.
//
// The access tokens minted here are signed with the same JWT_SECRET the self-hosted
// Supabase stack (GoTrue / PostgREST / Realtime) uses, and carry the same
// `role: authenticated` / `aud: authenticated` claims, so PostgREST + RLS accept them
// exactly like a GoTrue-issued token. Verification of an incoming GoTrue token (the
// browser approval step) uses the same secret.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function b64urlFromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function b64urlFromString(s: string): string {
  return b64urlFromBytes(encoder.encode(s));
}

function bytesFromB64url(s: string): Uint8Array<ArrayBuffer> {
  const pad = (4 - (s.length % 4)) % 4;
  const b64 = s.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat(pad);
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export interface JwtPayload {
  sub: string;
  iat: number;
  exp: number;
  [claim: string]: unknown;
}

/** Sign a payload as a compact HS256 JWT. */
export async function signJwt(payload: JwtPayload, secret: string): Promise<string> {
  const header = b64urlFromString(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64urlFromString(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;
  const key = await hmacKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(signingInput)));
  return `${signingInput}.${b64urlFromBytes(sig)}`;
}

/**
 * Verify an HS256 JWT's signature and expiry. Returns the decoded payload, or `null` if the
 * token is malformed, the signature is invalid, or it has expired. `nowSeconds` is injectable
 * so tests can assert expiry deterministically.
 */
export async function verifyJwt(
  token: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<JwtPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const key = await hmacKey(secret);
  let ok: boolean;
  try {
    ok = await crypto.subtle.verify(
      "HMAC",
      key,
      bytesFromB64url(sig),
      encoder.encode(`${header}.${body}`),
    );
  } catch {
    return null;
  }
  if (!ok) return null;
  let payload: JwtPayload;
  try {
    payload = JSON.parse(decoder.decode(bytesFromB64url(body)));
  } catch {
    return null;
  }
  if (typeof payload.exp === "number" && payload.exp < nowSeconds) return null;
  return payload;
}
