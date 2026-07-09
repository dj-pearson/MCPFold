import { existsSync, readdirSync } from 'node:fs';
import { delimiter } from 'node:path';
import { ALL_ADAPTERS, pathFor, realOsContext, type OsContext } from '@mcpfold/adapters';
import type { ClientId } from '@mcpfold/core';
import { appSignals } from './install-probes.js';

/**
 * Client detection via the adapters (S3.2, enriched S19.3). For each registered adapter we resolve
 * its user-scope config path and check whether it exists — but a client can be **installed without
 * an MCP config yet** (the exact case `init --guided` serves), which the config-only probe missed.
 * So we add an app-presence probe and expose a three-way {@link DetectionState}:
 *
 *   - `configured`     — the MCP config file exists (mcpfold can sync/import today).
 *   - `installed-only` — the app is installed but has no MCP config (a fold target for onboarding).
 *   - `not-found`      — neither signal hit.
 *
 * `installed` is retained (== `configured`) so existing `--json` consumers keep working — the new
 * fields are strictly additive.
 */

export type DetectionState = 'configured' | 'installed-only' | 'not-found';

export interface DetectedClient {
  id: ClientId;
  /** The user-scope config path probed. Empty if the adapter has no user-scope path. */
  path: string;
  /** LEGACY (S3.2): true iff the MCP config file exists. Kept for `--json` compatibility. */
  installed: boolean;
  /** S19.3: the app itself was detected on disk / PATH (independent of whether it is configured). */
  appPresent: boolean;
  /** S19.3: the three-way detection state (configured / installed-only / not-found). */
  state: DetectionState;
}

/** Injectable filesystem/PATH probes so detection is testable per platform without real I/O. */
export interface DetectProbe {
  fileExists(path: string): boolean;
  binOnPath(name: string): boolean;
  dirHasPrefix(dir: string, prefix: string): boolean;
}

/** The real-OS probe: existsSync, a PATH scan, and a prefix scan of an extensions dir. */
export function realProbe(ctx: OsContext): DetectProbe {
  const p = pathFor(ctx.platform);
  const pathDirs = (ctx.env.PATH ?? ctx.env.Path ?? '').split(delimiter).filter(Boolean);
  // On Windows a bare name resolves against PATHEXT; probe the common executable suffixes.
  const exts = ctx.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  return {
    fileExists: (path) => existsSync(path),
    binOnPath: (name) =>
      pathDirs.some((dir) => exts.some((ext) => existsSync(p.join(dir, name + ext)))),
    dirHasPrefix: (dir, prefix) => {
      try {
        return readdirSync(dir).some((entry) => entry.startsWith(prefix));
      } catch {
        return false; // dir absent / unreadable → no match
      }
    },
  };
}

/** Does any install-presence signal for this client hit? */
function detectApp(id: ClientId, ctx: OsContext, probe: DetectProbe): boolean {
  const signals = appSignals(id, ctx);
  return (
    signals.bins.some((bin) => probe.binOnPath(bin)) ||
    signals.dirs.some((dir) => probe.fileExists(dir)) ||
    signals.extensions.some((e) => probe.dirHasPrefix(e.dir, e.prefix))
  );
}

export function detectClients(
  ctx: OsContext = realOsContext(),
  probe: DetectProbe = realProbe(ctx),
): DetectedClient[] {
  // Escape hatch (S19.3): app-presence probing reads the real machine (PATH, install dirs), so it
  // is environment-dependent by design. `MCPFOLD_NO_APP_DETECTION=1` forces config-only detection —
  // used by the deterministic demo recorder and handy for CI/scripted runs that want stable output.
  const appProbingOff = ctx.env.MCPFOLD_NO_APP_DETECTION === '1';
  return ALL_ADAPTERS.map((adapter) => {
    let path = '';
    try {
      path = adapter.resolvePath('user', undefined, ctx);
    } catch {
      path = ''; // e.g. an adapter that has no user-scope path
    }
    const configured = path ? probe.fileExists(path) : false;
    const appPresent = appProbingOff ? false : detectApp(adapter.id, ctx, probe);
    const state: DetectionState = configured
      ? 'configured'
      : appPresent
        ? 'installed-only'
        : 'not-found';
    return { id: adapter.id, path, installed: configured, appPresent, state };
  }).sort((a, b) => a.id.localeCompare(b.id));
}
