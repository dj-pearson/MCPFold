import { createMcpServersAdapter } from './shared.js';
import { expandHome, joinFor, realOsContext } from './paths.js';
import type { OsContext } from './types.js';

/**
 * Warp adapter (S19.2). Warp shipped **file-based** MCP config (docs.warp.dev, verified July
 * 2026): a `.mcp.json` with the standard `mcpServers` root — stdio as `command`/`args`/`env`,
 * remote as `url`/`headers`. (Warp also stores GUI-added servers as Warp Drive objects in its
 * internal store; that path is not a user-editable file, so mcpfold targets `.mcp.json` only.)
 *
 *   - user (global):  `~/.warp/.mcp.json`               (`%USERPROFILE%\.warp\.mcp.json` on win)
 *   - project:        `<projectPath>/.warp/.mcp.json`   (versionable with the repo)
 *
 * The file is dedicated to MCP servers → full replace (Cursor ownership model). No restart, but
 * note Warp gates file-defined servers behind a one-time approval and never auto-spawns
 * project-scoped servers — the user enables them in Warp after the fold. Secret strategy `shim`.
 */
export const warpAdapter = createMcpServersAdapter({
  id: 'warp',
  secretStrategy: 'shim',
  needsRestart: false,
  // Native http/sse remotes with header auth (`url` + `headers`, no `type`).
  remote: { nativeHttp: true, nativeOauth: true, fieldShape: 'url' },
  resolvePath(scope, projectPath, ctx: OsContext = realOsContext()) {
    if (scope === 'user') return joinFor(ctx, ctx.home, '.warp', '.mcp.json');
    if (!projectPath) throw new Error('Warp project scope requires a project path.');
    return joinFor(ctx, expandHome(projectPath, ctx.home), '.warp', '.mcp.json');
  },
});
