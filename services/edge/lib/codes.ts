// Code generation + hashing for the device-code flow.
//
// - device_code: 32 random bytes, base64url — the high-entropy secret the CLI polls with.
// - user_code:   8 chars from an unambiguous alphabet (no 0/O/1/I/L), grouped XXXX-XXXX —
//                the short code the user types into the browser.
// Only the SHA-256 hash of the device_code is ever stored; the user_code is short-lived
// and single-use, so it is stored directly to be looked up on approval.

const encoder = new TextEncoder();

// Byte source is injectable so tests can produce deterministic codes.
export type RandomBytes = (n: number) => Uint8Array;

export const cryptoRandomBytes: RandomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

const USER_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L

/** A 43-char base64url secret (32 bytes of entropy). */
export function generateDeviceCode(random: RandomBytes = cryptoRandomBytes): string {
  return b64url(random(32));
}

/** An 8-char user code grouped as XXXX-XXXX from an unambiguous alphabet. */
export function generateUserCode(random: RandomBytes = cryptoRandomBytes): string {
  const bytes = random(8);
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += USER_CODE_ALPHABET[bytes[i] % USER_CODE_ALPHABET.length];
    if (i === 3) out += "-";
  }
  return out;
}

/** SHA-256 hex digest — used to store device/refresh tokens by hash, never in the clear. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
