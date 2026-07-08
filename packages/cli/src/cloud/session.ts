import { UsageError } from '@mcpfold/core';
import type { CloudApi } from './api.js';
import {
  type CloudSession,
  type KeychainBackend,
  loadSession,
  saveSession,
} from './token-store.js';

/** The cloud (edge) API base URL — overridable for self-hosted / dev via MCPFOLD_API_URL.
 * The hosted edge service lives on its own host; Supabase owns api.mcpfold.com. */
export function resolveEndpoint(env: NodeJS.ProcessEnv = process.env): string {
  return env.MCPFOLD_API_URL ?? 'https://functions.mcpfold.com';
}

/** Load the stored session or fail with a clear "log in first" error. */
export async function requireSession(backend: KeychainBackend): Promise<CloudSession> {
  const session = await loadSession(backend);
  if (!session) {
    throw new UsageError('Not logged in to mcpfold cloud.', {
      hint: 'Run `mcpfold login` first.',
    });
  }
  return session;
}

/**
 * Return a valid access token, refreshing it (and persisting the rotated session) when it is
 * expired or within a minute of expiring. A failed refresh means the session is dead → the
 * user must log in again.
 */
export async function getAccessToken(
  session: CloudSession,
  api: CloudApi,
  backend: KeychainBackend,
  nowMs: number = Date.now(),
): Promise<string> {
  if (session.expiresAt * 1000 > nowMs + 60_000) return session.accessToken;
  try {
    const refreshed = await api.refresh(session.refreshToken);
    const updated: CloudSession = {
      ...session,
      accessToken: refreshed.access_token,
      // The server rotates the refresh token (S9.5) — persist the new one, or reuse detection
      // will revoke the session on the next refresh.
      refreshToken: refreshed.refresh_token ?? session.refreshToken,
      expiresAt: Math.floor(nowMs / 1000) + refreshed.expires_in,
    };
    await saveSession(updated, backend);
    return updated.accessToken;
  } catch {
    throw new UsageError('Your cloud session has expired.', {
      hint: 'Run `mcpfold login` to sign in again.',
    });
  }
}

/** Normalize a network failure into a clear, actionable error naming the endpoint. */
export function endpointError(endpoint: string, cause: unknown): UsageError {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new UsageError(`Could not reach the mcpfold cloud at ${endpoint}: ${detail}`, {
    hint: 'Check your connection and the endpoint (MCPFOLD_API_URL), then retry.',
  });
}
