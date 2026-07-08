import { createMcpServersAdapter } from './shared.js';
import { joinFor, realOsContext, userConfigDir } from './paths.js';
import type { OsContext } from './types.js';

/**
 * Claude Desktop adapter (S2.3). Root key `mcpServers`, **user scope only** (no project),
 * and the app must be **restarted** to pick up changes (needsRestart=true) — which `sync`
 * surfaces to the user. Path per OS:
 *   - macOS:   ~/Library/Application Support/Claude/claude_desktop_config.json
 *   - Windows: %APPDATA%\Claude\claude_desktop_config.json
 *   - Linux:   ~/.config/Claude/claude_desktop_config.json
 */
export const claudeDesktopAdapter = createMcpServersAdapter({
  id: 'claude-desktop',
  secretStrategy: 'shim',
  needsRestart: true,
  resolvePath(scope, _projectPath, ctx: OsContext = realOsContext()) {
    if (scope !== 'user') {
      throw new Error('Claude Desktop only supports user scope (no project/workspace config).');
    }
    return joinFor(ctx, userConfigDir(ctx), 'Claude', 'claude_desktop_config.json');
  },
});
