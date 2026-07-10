import { createMcpServersAdapter } from './shared.js';
import { expandHome, joinFor, realOsContext } from './paths.js';
import type { OsContext } from './types.js';

/**
 * Zed adapter (S2.7, project scope S19.3). Zed diverges on the **root key**: `context_servers`,
 * not `mcpServers`. No restart (needsRestart=false), default `shim` strategy. Entry shape reuses
 * the `mcpServers`-style stdio/remote entries under the Zed root key; Zed context servers are
 * stdio-first.
 *
 * Zed supports **project scope** (verified July 2026): a project-local `.zed/settings.json` with
 * the same `context_servers` schema overrides the user settings for that project. User path:
 *   - macOS/Linux: ~/.config/zed/settings.json
 *   - Windows:     %APPDATA%\Zed\settings.json
 * Project path: `<projectPath>/.zed/settings.json` (same on every OS).
 */
export const zedAdapter = createMcpServersAdapter({
  id: 'zed',
  rootKey: 'context_servers',
  secretStrategy: 'shim',
  needsRestart: false,
  // Native HTTP remotes with OAuth (verified July 2026); `url` under `context_servers`.
  remote: { nativeHttp: true, nativeOauth: true, fieldShape: 'url' },
  resolvePath(scope, projectPath, ctx: OsContext = realOsContext()) {
    if (scope !== 'user') {
      if (!projectPath) throw new Error('Zed project scope requires a project path.');
      return joinFor(ctx, expandHome(projectPath, ctx.home), '.zed', 'settings.json');
    }
    if (ctx.platform === 'win32') {
      const appData = ctx.env.APPDATA ?? joinFor(ctx, ctx.home, 'AppData', 'Roaming');
      return joinFor(ctx, appData, 'Zed', 'settings.json');
    }
    return joinFor(ctx, ctx.home, '.config', 'zed', 'settings.json');
  },
});
