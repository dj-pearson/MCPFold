import type { CloudApi } from '../api/cloud';

/**
 * Per-machine revocation (S9.5). Revoking a machine invalidates all of its sessions immediately
 * on the server (via /revoke); the sync dashboard then refetches so the machine drops off. The
 * revoked machine's next refresh is denied, forcing it to log in again.
 */
export function revokeMachine(api: CloudApi, name: string): Promise<void> {
  return api.revokeMachine(name);
}
