import { createMcpServersAdapter } from './shared.js';
import { joinFor, realOsContext } from './paths.js';
import type { OsContext } from './types.js';

/**
 * Windsurf adapter (S2.6, S17.2). Windsurf uses the `mcpServers` root and **can** call an
 * unauthenticated remote natively (bare `url`), but **cannot attach auth to a native remote
 * entry** — so an authenticated http/sse server is bridged to a pinned `npx mcp-remote` stdio
 * launch instead (`nativeHttp: true`, `nativeOauth: false`). That decision, and the shim
 * render/parse, now live in the shared factory (`remoteNeedsShim`), so this adapter is just its
 * path + capability. Restart required (needsRestart=true). Config path (every OS):
 * `~/.codeium/windsurf/mcp_config.json`.
 *
 * **User scope only** (verified July 2026): Windsurf/Cascade loads a single global file and has no
 * project/workspace-scoped MCP config, so a non-user scope throws (rather than silently writing a
 * project profile to the shared user file) — S19.3.
 */
export const windsurfAdapter = createMcpServersAdapter({
  id: 'windsurf',
  // Default `shim`; declares the `${env:VAR}` dialect so a profile/server can opt into `native-env`
  // (S19.4).
  secretStrategy: 'shim',
  needsRestart: true,
  // Native unauthenticated remotes, but authed remotes must go through the mcp-remote shim.
  remote: { nativeHttp: true, nativeOauth: false, fieldShape: 'url' },
  envInterpolation: (name) => '${env:' + name + '}',
  resolvePath(scope, _projectPath, ctx: OsContext = realOsContext()) {
    if (scope !== 'user') {
      throw new Error('Windsurf only supports user scope (no project/workspace config).');
    }
    return joinFor(ctx, ctx.home, '.codeium', 'windsurf', 'mcp_config.json');
  },
});
