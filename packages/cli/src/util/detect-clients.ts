import { existsSync } from 'node:fs';
import { ALL_ADAPTERS, realOsContext, type OsContext } from '@mcpfold/adapters';
import type { ClientId } from '@mcpfold/core';

/**
 * Client detection via the adapters (S3.2). For each registered adapter we resolve its
 * user-scope config path and check whether it exists — the authoritative, per-OS source of
 * truth (this supersedes the earlier provisional hardcoded path map).
 */

export interface DetectedClient {
  id: ClientId;
  /** The user-scope config path probed. Empty if the adapter has no user-scope path. */
  path: string;
  installed: boolean;
}

export function detectClients(ctx: OsContext = realOsContext()): DetectedClient[] {
  return ALL_ADAPTERS.map((adapter) => {
    let path = '';
    try {
      path = adapter.resolvePath('user', undefined, ctx);
    } catch {
      path = ''; // e.g. an adapter that has no user-scope path
    }
    return { id: adapter.id, path, installed: path ? existsSync(path) : false };
  }).sort((a, b) => a.id.localeCompare(b.id));
}
