import type { Config } from '@mcpfold/core';

/**
 * Typed client for the mcpfold cloud edge API (S6.6) — the counterpart to the S6.3 auth and
 * S6.4 push/pull edge functions. The commands depend on the {@link CloudApi} interface so tests
 * inject a fake; {@link httpCloudApi} is the real `fetch`-backed implementation.
 */

export interface StartResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

export type PollResponse =
  | { status: 'complete'; access_token: string; refresh_token: string; expires_in: number }
  | { status: 'pending'; interval: number }
  | { status: 'error'; error: string };

export interface RefreshResponse {
  access_token: string;
  expires_in: number;
  /** The rotated refresh token (S9.5) — the client must store it; the old one is now invalid. */
  refresh_token?: string;
}

export interface PushResponse {
  id: string;
  version: number;
  created_at: string;
}

export interface PullResponse {
  id: string;
  version: number;
  config: Config;
  created_at: string;
  created_by: string;
  /** HMAC signature of the config (S9.2); absent for unsigned/legacy versions. */
  signature?: string;
}

export interface PushBody {
  config: Config;
  machine_name?: string;
  team_id?: string;
  /** HMAC signature of the config (S9.2). */
  signature?: string;
}

export interface CloudApi {
  startDevice(machineName?: string): Promise<StartResponse>;
  pollDevice(deviceCode: string): Promise<PollResponse>;
  refresh(refreshToken: string): Promise<RefreshResponse>;
  push(accessToken: string, body: PushBody): Promise<PushResponse>;
  pull(
    accessToken: string,
    opts: { team_id?: string; version?: number },
  ): Promise<PullResponse | null>;
}

type FetchLike = typeof fetch;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

export function httpCloudApi(endpoint: string, fetchImpl: FetchLike = fetch): CloudApi {
  const base = endpoint.replace(/\/+$/, '');
  const post = async (path: string, body: unknown, token?: string): Promise<Response> =>
    fetchImpl(`${base}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });

  return {
    async startDevice(machineName) {
      const res = await post('/auth-device/start', { machine_name: machineName });
      if (!res.ok) throw new Error(`device-code start failed (${res.status})`);
      return (await res.json()) as StartResponse;
    },

    async pollDevice(deviceCode) {
      const res = await post('/auth-device/poll', { device_code: deviceCode });
      const body = (await res.json()) as Record<string, unknown>;
      if (res.ok) {
        // Validate the shape at the source (S16.6): a malformed 200 must fail fast here
        // rather than persisting undefined/empty tokens that only surface later on read.
        const { access_token, refresh_token, expires_in } = body;
        if (!isNonEmptyString(access_token) || !isNonEmptyString(refresh_token)) {
          throw new Error(
            'device-code poll returned a malformed session (missing access or refresh token)',
          );
        }
        if (typeof expires_in !== 'number' || !Number.isFinite(expires_in)) {
          throw new Error('device-code poll returned a malformed session (invalid expires_in)');
        }
        return { status: 'complete', access_token, refresh_token, expires_in };
      }
      if (body.error === 'authorization_pending') {
        return { status: 'pending', interval: (body.interval as number) ?? 5 };
      }
      return { status: 'error', error: (body.error as string) ?? `poll failed (${res.status})` };
    },

    async refresh(refreshToken) {
      const res = await post('/auth-device/refresh', { refresh_token: refreshToken });
      if (!res.ok) throw new Error(`token refresh failed (${res.status})`);
      // Validate the shape at the source (S22.15), like pollDevice: a malformed 200 must fail fast
      // here rather than persisting an undefined access token (→ silent logout on the next read) or a
      // NaN expiry (→ every call re-refreshes). refresh_token is optional (the server may not rotate
      // it) but, if present, must be a non-empty string.
      const body = (await res.json()) as Record<string, unknown>;
      const { access_token, refresh_token, expires_in } = body;
      if (!isNonEmptyString(access_token)) {
        throw new Error('token refresh returned a malformed session (missing access token)');
      }
      if (typeof expires_in !== 'number' || !Number.isFinite(expires_in)) {
        throw new Error('token refresh returned a malformed session (invalid expires_in)');
      }
      if (refresh_token !== undefined && !isNonEmptyString(refresh_token)) {
        throw new Error('token refresh returned a malformed session (invalid refresh token)');
      }
      return {
        access_token,
        expires_in,
        ...(refresh_token !== undefined ? { refresh_token } : {}),
      };
    },

    async push(accessToken, body) {
      const res = await post('/push', body, accessToken);
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `push failed (${res.status})`);
      }
      return (await res.json()) as PushResponse;
    },

    async pull(accessToken, opts) {
      const params = new URLSearchParams();
      if (opts.team_id) params.set('team_id', opts.team_id);
      if (opts.version !== undefined) params.set('version', String(opts.version));
      const qs = params.toString();
      const res = await fetchImpl(`${base}/pull${qs ? `?${qs}` : ''}`, {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`pull failed (${res.status})`);
      return (await res.json()) as PullResponse;
    },
  };
}
