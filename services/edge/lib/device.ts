// Device-code OAuth business logic (RFC 8628-style), decoupled from HTTP.
//
// The flow:
//   1. start   — the CLI requests a device_code + user_code; the user is told to open a URL.
//   2. approve — the signed-in web user submits the user_code (with their GoTrue JWT); the
//                request is bound to their user id.
//   3. poll    — the CLI polls with the device_code; once approved it receives an access
//                token (HS256 JWT, same contract as GoTrue) + a refresh token.
//   4. refresh — the CLI exchanges a refresh token for a fresh access token.
//
// Only hashes of the device_code / refresh_token are persisted. All timestamps flow through
// an injectable `now` so tests are deterministic; the byte source is injectable too.

import postgres from "postgres";
import { generateDeviceCode, generateUserCode, type RandomBytes, sha256Hex } from "./codes.ts";
import { signJwt } from "./jwt.ts";

export type Sql = ReturnType<typeof postgres>;

export interface DeviceAuthConfig {
  jwtSecret: string;
  siteUrl: string;
  /** device_code lifetime before the user must restart login. */
  deviceCodeTtlSeconds: number;
  /** access token lifetime (mirrors Supabase jwt_expiry, default 3600). */
  accessTtlSeconds: number;
  /** refresh token lifetime. */
  refreshTtlSeconds: number;
  /** minimum seconds the CLI should wait between polls. */
  pollIntervalSeconds: number;
}

export const DEFAULT_CONFIG: Omit<DeviceAuthConfig, "jwtSecret" | "siteUrl"> = {
  deviceCodeTtlSeconds: 600, // 10 minutes
  accessTtlSeconds: 3600, // 1 hour
  refreshTtlSeconds: 60 * 60 * 24 * 30, // 30 days
  pollIntervalSeconds: 5,
};

export interface StartResult {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

export type ApproveResult =
  | { ok: true }
  | { ok: false; error: "invalid_user_code" | "expired" | "already_used" };

export type PollResult =
  | {
    status: "complete";
    access_token: string;
    refresh_token: string;
    token_type: "Bearer";
    expires_in: number;
  }
  | { status: "pending"; interval: number }
  | { status: "error"; error: "expired_token" | "invalid_grant" | "slow_down" };

/** Mint an access token PostgREST + RLS will accept exactly like a GoTrue-issued one. */
export async function mintAccessToken(
  cfg: DeviceAuthConfig,
  userId: string,
  machineName: string | null,
  now: Date,
): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  return await signJwt(
    {
      sub: userId,
      role: "authenticated",
      aud: "authenticated",
      iat,
      exp: iat + cfg.accessTtlSeconds,
      machine: machineName ?? undefined,
      scope: "sync",
    },
    cfg.jwtSecret,
  );
}

/** Step 1 — create a pending device authorization. */
export async function startDeviceAuth(
  sql: Sql,
  cfg: DeviceAuthConfig,
  opts: { machineName?: string; now?: Date; random?: RandomBytes } = {},
): Promise<StartResult> {
  const now = opts.now ?? new Date();
  const deviceCode = generateDeviceCode(opts.random);
  const userCode = generateUserCode(opts.random);
  const deviceCodeHash = await sha256Hex(deviceCode);
  const expiresAt = new Date(now.getTime() + cfg.deviceCodeTtlSeconds * 1000);

  await sql`
    insert into public.device_codes
      (device_code_hash, user_code, machine_name, interval_seconds, created_at, expires_at)
    values
      (${deviceCodeHash}, ${userCode}, ${opts.machineName ?? null}, ${cfg.pollIntervalSeconds},
       ${now}, ${expiresAt})
  `;

  const verificationUri = `${cfg.siteUrl}/auth/device`;
  return {
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: verificationUri,
    verification_uri_complete: `${verificationUri}?code=${encodeURIComponent(userCode)}`,
    expires_in: cfg.deviceCodeTtlSeconds,
    interval: cfg.pollIntervalSeconds,
  };
}

/** Step 2 — bind a pending device authorization to the approving user. */
export async function approveDeviceAuth(
  sql: Sql,
  opts: { userCode: string; userId: string; now?: Date },
): Promise<ApproveResult> {
  const now = opts.now ?? new Date();
  const userCode = opts.userCode.trim().toUpperCase();

  const [row] = await sql`
    select status, expires_at from public.device_codes where user_code = ${userCode}
  `;
  if (!row) return { ok: false, error: "invalid_user_code" };
  if (new Date(row.expires_at) <= now) return { ok: false, error: "expired" };
  if (row.status !== "pending") return { ok: false, error: "already_used" };

  const updated = await sql`
    update public.device_codes
    set status = 'approved', user_id = ${opts.userId}, approved_at = ${now}
    where user_code = ${userCode} and status = 'pending'
    returning id
  `;
  if (updated.length === 0) return { ok: false, error: "already_used" };
  return { ok: true };
}

/** Step 3 — the CLI polls; once approved, it is issued tokens (single-use claim). */
export async function pollDeviceAuth(
  sql: Sql,
  cfg: DeviceAuthConfig,
  opts: { deviceCode: string; now?: Date; random?: RandomBytes },
): Promise<PollResult> {
  const now = opts.now ?? new Date();
  const hash = await sha256Hex(opts.deviceCode);

  const [row] = await sql`
    select status, expires_at, interval_seconds, last_polled_at
    from public.device_codes where device_code_hash = ${hash}
  `;
  if (!row) return { status: "error", error: "invalid_grant" };

  if (new Date(row.expires_at) <= now) {
    await sql`
      update public.device_codes set status = 'expired'
      where device_code_hash = ${hash} and status <> 'claimed'
    `;
    return { status: "error", error: "expired_token" };
  }

  if (row.status === "pending") {
    // Rate-limit polling (RFC 8628 slow_down): refuse a poll that arrives faster than the
    // advertised interval, so a client can't hammer the endpoint brute-forcing user codes.
    const interval = (row.interval_seconds as number) ?? cfg.pollIntervalSeconds;
    if (
      row.last_polled_at && now.getTime() - new Date(row.last_polled_at).getTime() < interval * 1000
    ) {
      return { status: "error", error: "slow_down" };
    }
    await sql`
      update public.device_codes set last_polled_at = ${now} where device_code_hash = ${hash}
    `;
    return { status: "pending", interval };
  }

  // 'claimed' (already redeemed — device codes are single-use) or 'expired'.
  if (row.status !== "approved") return { status: "error", error: "expired_token" };

  // Atomically claim the approved code so a race can't mint two sessions.
  const claimed = await sql`
    update public.device_codes set status = 'claimed', claimed_at = ${now}
    where device_code_hash = ${hash} and status = 'approved'
    returning user_id, machine_name
  `;
  if (claimed.length === 0) return { status: "error", error: "expired_token" };

  const userId = claimed[0].user_id as string;
  const machineName = (claimed[0].machine_name as string | null) ?? null;

  const accessToken = await mintAccessToken(cfg, userId, machineName, now);
  const refreshToken = generateDeviceCode(opts.random);
  const refreshHash = await sha256Hex(refreshToken);
  const refreshExpiresAt = new Date(now.getTime() + cfg.refreshTtlSeconds * 1000);
  // A new session opens a new refresh-token family (S9.5) for rotation + reuse detection.
  const familyId = crypto.randomUUID();
  await sql`
    insert into public.sessions
      (user_id, refresh_token_hash, machine_name, family_id, created_at, expires_at)
    values
      (${userId}, ${refreshHash}, ${machineName}, ${familyId}, ${now}, ${refreshExpiresAt})
  `;

  return {
    status: "complete",
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "Bearer",
    expires_in: cfg.accessTtlSeconds,
  };
}

// Refresh rotation + reuse detection + per-machine revocation live in src/session.ts (S9.5).
