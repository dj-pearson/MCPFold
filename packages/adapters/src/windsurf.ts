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
 */
export const windsurfAdapter = createMcpServersAdapter({
  id: 'windsurf',
  secretStrategy: 'shim',
  needsRestart: true,
  // Native unauthenticated remotes, but authed remotes must go through the mcp-remote shim.
  remote: { nativeHttp: true, nativeOauth: false, fieldShape: 'url' },
  resolvePath(_scope, _projectPath, ctx: OsContext = realOsContext()) {
    return joinFor(ctx, ctx.home, '.codeium', 'windsurf', 'mcp_config.json');
  },
});
