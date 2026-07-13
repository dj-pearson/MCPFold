import type { Config, ToolsDirective } from '@mcpfold/core';
import { readSnapshot, type CacheLocation, type SurfaceSnapshot } from './cache.js';

/**
 * Allow-list staleness (S24.11). `filterTools` keeps only listed names, so any tool a server ships
 * AFTER its allow-list was written is invisible with no signal — indefinitely. Comparing the current
 * discovery snapshot (S24.6) against the allow directive surfaces exactly those new upstream tools, so
 * new capabilities become a conscious choice instead of silently hidden. Deny-mode directives are
 * unaffected: a new tool already passes through by construction, so there is nothing to report.
 */

/** Tool names present on the discovered surface but NOT covered by an `allow` directive. */
export function newUpstreamTools(
  directive: ToolsDirective | undefined,
  snapshot: SurfaceSnapshot | null,
): string[] {
  // Only an allow directive HIDES tools; deny/none let new tools through, so nothing is stale.
  if (!snapshot || directive?.mode !== 'allow') return [];
  const allowed = new Set(directive.list);
  return snapshot.tools
    .map((t) => t.name)
    .filter((name) => !allowed.has(name))
    .sort();
}

/** One server's staleness: how many discovered tools its allow-list does not yet cover. */
export interface AllowlistStaleness {
  server: string;
  newTools: string[];
}

/**
 * Every allow-mode server whose cached discovery snapshot contains tools its allow-list predates.
 * Servers with no snapshot, no allow directive, or nothing new are omitted.
 */
export function staleAllowlists(
  config: Pick<Config, 'servers'>,
  cache: CacheLocation = {},
): AllowlistStaleness[] {
  const out: AllowlistStaleness[] = [];
  for (const [name, server] of Object.entries(config.servers)) {
    if (server.tools?.mode !== 'allow') continue;
    const newTools = newUpstreamTools(server.tools, readSnapshot(name, cache));
    if (newTools.length > 0) out.push({ server: name, newTools });
  }
  return out;
}
