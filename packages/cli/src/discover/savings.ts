import type { ToolsDirective } from '@mcpfold/core';
import { isToolAllowed } from '@mcpfold/proxy';
import { readSnapshot, type CacheLocation, type SurfaceSnapshot } from './cache.js';

/**
 * Honest savings reporting (S24.9). Every savings number mcpfold shows a user is computed from THAT
 * user's servers — a live discovery snapshot (S24.6) — and THEIR curation directive. There is no
 * fixture fallback: if we have no measured surface for a server, we make no savings claim for it.
 */

export interface ServerSavings {
  server: string;
  /** Whether a `tools` directive is actually in effect (curation active). */
  curated: boolean;
  fullCount: number;
  keptCount: number;
  fullTokens: number;
  keptTokens: number;
}

/** Compute a server's measured savings from its discovery snapshot and current directive. */
export function serverSavings(
  snapshot: SurfaceSnapshot,
  directive: ToolsDirective | undefined,
): ServerSavings {
  const kept = directive
    ? snapshot.tools.filter((t) => isToolAllowed(t.name, directive))
    : snapshot.tools;
  return {
    server: snapshot.server,
    curated: directive !== undefined,
    fullCount: snapshot.toolCount,
    keptCount: kept.length,
    fullTokens: snapshot.totalTokens,
    keptTokens: kept.reduce((sum, t) => sum + t.tokens, 0),
  };
}

/** Load the measured savings for a curated server, or null when no snapshot exists (no claim). */
export function measuredSavings(
  server: string,
  directive: ToolsDirective | undefined,
  cache: CacheLocation = {},
): ServerSavings | null {
  const snapshot = readSnapshot(server, cache);
  if (!snapshot) return null;
  return serverSavings(snapshot, directive);
}

/** Compact token count: `1497` → `~1.5k`, `900` → `~900`. Always prefixed to read as an estimate. */
export function formatTokens(n: number): string {
  if (n < 1000) return `~${n}`;
  return `~${(n / 1000).toFixed(1)}k`;
}

/**
 * One honest per-server savings line, e.g.
 * `github: 9 of 35 tools, ~5.8k → ~1.4k tokens (approx)`.
 * The "(approx)" label follows the benchmark-honesty convention — the counts are real, the
 * token figure is the benchmark's 1-tok≈4-char estimate.
 */
export function renderServerSavingsLine(s: ServerSavings): string {
  return `${s.server}: ${s.keptCount} of ${s.fullCount} tools, ${formatTokens(s.fullTokens)} → ${formatTokens(s.keptTokens)} tokens (approx)`;
}

/** A server config as far as savings care: whether it carries a `tools` directive. */
export interface CuratedServerLike {
  tools?: ToolsDirective;
}

/**
 * Measured savings for every curated server that has a discovery snapshot. A curated server WITHOUT a
 * snapshot yields no entry (no measured claim); an uncurated server is never counted. Sorted by name.
 */
export function curatedServerSavings(
  servers: Record<string, CuratedServerLike>,
  cache: CacheLocation = {},
): ServerSavings[] {
  const out: ServerSavings[] = [];
  for (const [name, server] of Object.entries(servers)) {
    if (!server.tools) continue;
    const s = measuredSavings(name, server.tools, cache);
    if (s) out.push(s);
  }
  return out.sort((a, b) => a.server.localeCompare(b.server));
}

/**
 * The honest savings block for onboarding / status (S24.9). Every number is measured from the user's
 * own config; when nothing is curated we say exactly that instead of quoting the fixture benchmark as
 * if it were theirs. Returns plain lines (no styling) so each caller can format them.
 */
export function renderSavingsBlock(
  servers: Record<string, CuratedServerLike>,
  cache: CacheLocation = {},
): string[] {
  const curatedCount = Object.values(servers).filter((s) => s.tools).length;
  if (curatedCount === 0) {
    return [
      'No curation active — every server exposes its full toolset to each client.',
      'Add a `tools` allow-list or run `mcpfold curate` to trim context. ' +
        'The benchmark (docs/benchmark.md) shows ~80% fewer tokens on a representative config.',
    ];
  }
  const measured = curatedServerSavings(servers, cache);
  if (measured.length === 0) {
    return [
      `${curatedCount} server${curatedCount === 1 ? '' : 's'} curated — run \`mcpfold inspect\` to measure the exact token savings on your config.`,
    ];
  }
  const fullTokens = measured.reduce((sum, s) => sum + s.fullTokens, 0);
  const keptTokens = measured.reduce((sum, s) => sum + s.keptTokens, 0);
  const lines = ['Measured context savings (your config):'];
  for (const s of measured) lines.push(`  ${renderServerSavingsLine(s)}`);
  lines.push(`  Total: ${formatTokens(fullTokens)} → ${formatTokens(keptTokens)} tokens (approx).`);
  return lines;
}
