import type { ClientId } from '@mcpfold/core';
import type { ClientAdapter } from './types.js';

/**
 * The adapter registry (S2.1) — the single lookup the CLI uses to go from a client id to
 * its adapter. Concrete adapters self-register (see each adapter module + registerAll).
 */

const registry = new Map<string, ClientAdapter>();

/** Register (or replace) an adapter by its client id. */
export function registerAdapter(adapter: ClientAdapter): void {
  registry.set(adapter.id, adapter);
}

/** Look up an adapter, or `undefined` if none is registered for the id. */
export function getAdapter(id: string): ClientAdapter | undefined {
  return registry.get(id);
}

/** Look up an adapter, throwing a descriptive error if it is missing. */
export function requireAdapter(id: ClientId): ClientAdapter {
  const adapter = registry.get(id);
  if (!adapter) {
    const known = [...registry.keys()].sort().join(', ') || '(none registered)';
    throw new Error(`No adapter registered for client "${id}". Registered: ${known}.`);
  }
  return adapter;
}

/** All registered adapters, sorted by id for deterministic iteration. */
export function listAdapters(): ClientAdapter[] {
  return [...registry.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** Remove every registered adapter (test isolation). */
export function clearAdapters(): void {
  registry.clear();
}
