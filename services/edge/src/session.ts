// Session hardening (S9.5): refresh-token rotation with reuse detection, and per-machine
// revocation. These operate on the service-managed `sessions` table (deny-by-default RLS), so
// they run on the privileged connection and scope every write to the authenticated user id.

import { generateDeviceCode, type RandomBytes, sha256Hex } from "../lib/codes.ts";
import { type DeviceAuthConfig, mintAccessToken, type Sql } from "../lib/device.ts";

export type RotateResult =
  | {
    ok: true;
    access_token: string;
    refresh_token: string;
    token_type: "Bearer";
    expires_in: number;
  }
  | { ok: false; error: "invalid_grant" | "expired" | "revoked" | "reuse_detected" };

/**
 * Exchange a refresh token for a fresh access token, ROTATING the refresh token. If the presented
 * token was already rotated (used) — a replay — the entire session family is revoked and the
 * request is refused: a stolen-and-replayed token can't outlive its detection.
 */
export async function rotateRefresh(
  sql: Sql,
  cfg: DeviceAuthConfig,
  opts: { refreshToken: string; now?: Date; random?: RandomBytes },
): Promise<RotateResult> {
  const now = opts.now ?? new Date();
  const hash = await sha256Hex(opts.refreshToken);

  const [row] = await sql`
    select id, user_id, machine_name, family_id, expires_at, revoked_at, rotated_at
    from public.sessions where refresh_token_hash = ${hash}
  `;
  if (!row) return { ok: false, error: "invalid_grant" };
  if (row.revoked_at) return { ok: false, error: "revoked" };

  // Reuse: an already-rotated token is presented again → revoke the whole family.
  if (row.rotated_at) {
    await sql`
      update public.sessions set revoked_at = ${now}
      where family_id = ${row.family_id} and revoked_at is null
    `;
    return { ok: false, error: "reuse_detected" };
  }
  if (new Date(row.expires_at) <= now) return { ok: false, error: "expired" };

  const newRefresh = generateDeviceCode(opts.random);
  const newHash = await sha256Hex(newRefresh);
  const newExpiry = new Date(now.getTime() + cfg.refreshTtlSeconds * 1000);
  await sql.begin(async (tx) => {
    await tx`
      update public.sessions set rotated_at = ${now}, last_used_at = ${now} where id = ${row.id}
    `;
    await tx`
      insert into public.sessions
        (user_id, refresh_token_hash, machine_name, family_id, created_at, expires_at)
      values
        (${row.user_id}, ${newHash}, ${row.machine_name}, ${row.family_id}, ${now}, ${newExpiry})
    `;
  });

  const accessToken = await mintAccessToken(
    cfg,
    row.user_id as string,
    (row.machine_name as string | null) ?? null,
    now,
  );
  return {
    ok: true,
    access_token: accessToken,
    refresh_token: newRefresh,
    token_type: "Bearer",
    expires_in: cfg.accessTtlSeconds,
  };
}

/**
 * Revoke every live session for one of the user's machines. Scoped to `userId` (the endpoint has
 * verified the JWT) — a caller can only revoke their own machines. Returns how many were revoked.
 */
export async function revokeMachine(
  sql: Sql,
  opts: { userId: string; machineName: string; now?: Date },
): Promise<{ revoked: number }> {
  const now = opts.now ?? new Date();
  const rows = await sql`
    update public.sessions set revoked_at = ${now}
    where user_id = ${opts.userId} and machine_name = ${opts.machineName} and revoked_at is null
    returning id
  `;
  return { revoked: rows.length };
}
