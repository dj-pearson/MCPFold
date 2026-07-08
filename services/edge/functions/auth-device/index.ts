// Device-code OAuth edge function (S6.3).
//
// Routes (matched by the final path segment, so it works both when mounted at
// `/auth-device/*` behind the side Docker service and at
// `/functions/v1/auth-device/*` on the managed Supabase runtime):
//
//   GET  …/health   → liveness probe
//   POST …/start    → { machine_name? }                     → device_code + user_code + URL
//   POST …/approve  → Authorization: Bearer <gotrue-jwt>, { user_code }
//   POST …/poll     → { device_code }                       → tokens | authorization_pending
//   POST …/refresh  → { refresh_token }                     → fresh access token
//
// The `approve` step is the only authenticated endpoint: it verifies the browser user's
// GoTrue JWT with the shared JWT_SECRET (same trust contract as PostgREST/RLS) and binds the
// pending request to that user's id. `start`/`poll`/`refresh` are called by a not-yet- or
// no-longer-authenticated CLI and are protected by the unguessable device_code / refresh
// token instead.

import {
  approveDeviceAuth,
  type DeviceAuthConfig,
  pollDeviceAuth,
  refreshSession,
  type Sql,
  startDeviceAuth,
} from "../../lib/device.ts";
import { verifyJwt } from "../../lib/jwt.ts";
import { json, readJson, segment } from "../../lib/http.ts";

export interface HandlerDeps {
  sql: Sql;
  cfg: DeviceAuthConfig;
  /** Verify the browser approver's bearer token → user id, or null if invalid. */
  verifyApprover?: (token: string, now?: Date) => Promise<string | null>;
  /** Injectable clock for tests. */
  now?: () => Date;
}

export function createHandler(deps: HandlerDeps): (req: Request) => Promise<Response> {
  const now = deps.now ?? (() => new Date());
  const verifyApprover = deps.verifyApprover ??
    (async (token: string, at?: Date) => {
      const payload = await verifyJwt(
        token,
        deps.cfg.jwtSecret,
        at ? Math.floor(at.getTime() / 1000) : undefined,
      );
      return payload && typeof payload.sub === "string" ? payload.sub : null;
    });

  return async (req: Request): Promise<Response> => {
    const route = segment(req.url);

    if (route === "health") return json({ ok: true });

    if (req.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }

    try {
      switch (route) {
        case "start": {
          const body = await readJson(req);
          const machineName = typeof body.machine_name === "string" ? body.machine_name : undefined;
          const result = await startDeviceAuth(deps.sql, deps.cfg, {
            machineName,
            now: now(),
          });
          return json(result, 200);
        }

        case "approve": {
          const auth = req.headers.get("authorization") ?? "";
          const match = auth.match(/^Bearer\s+(.+)$/i);
          if (!match) return json({ error: "unauthorized" }, 401);
          const userId = await verifyApprover(match[1], now());
          if (!userId) return json({ error: "unauthorized" }, 401);

          const body = await readJson(req);
          const userCode = typeof body.user_code === "string" ? body.user_code : "";
          if (!userCode) return json({ error: "invalid_request" }, 400);

          const result = await approveDeviceAuth(deps.sql, { userCode, userId, now: now() });
          if (!result.ok) {
            const status = result.error === "invalid_user_code" ? 404 : 409;
            return json({ error: result.error }, status);
          }
          return json({ ok: true });
        }

        case "poll": {
          const body = await readJson(req);
          const deviceCode = typeof body.device_code === "string" ? body.device_code : "";
          if (!deviceCode) return json({ error: "invalid_request" }, 400);

          const result = await pollDeviceAuth(deps.sql, deps.cfg, { deviceCode, now: now() });
          if (result.status === "complete") {
            return json({
              access_token: result.access_token,
              refresh_token: result.refresh_token,
              token_type: result.token_type,
              expires_in: result.expires_in,
            }, 200);
          }
          if (result.status === "pending") {
            return json({ error: "authorization_pending", interval: result.interval }, 400);
          }
          return json({ error: result.error }, 400);
        }

        case "refresh": {
          const body = await readJson(req);
          const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token : "";
          if (!refreshToken) return json({ error: "invalid_request" }, 400);

          const result = await refreshSession(deps.sql, deps.cfg, { refreshToken, now: now() });
          if (!result.ok) return json({ error: result.error }, 400);
          return json({
            access_token: result.access_token,
            token_type: result.token_type,
            expires_in: result.expires_in,
          }, 200);
        }

        default:
          return json({ error: "not_found" }, 404);
      }
    } catch (err) {
      // Never leak internals; log server-side for diagnostics.
      console.error("auth-device error:", err instanceof Error ? err.message : err);
      return json({ error: "internal_error" }, 500);
    }
  };
}
