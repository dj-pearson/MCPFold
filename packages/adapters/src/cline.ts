import { createMcpServersAdapter } from './shared.js';
import { joinFor, realOsContext, userConfigDir } from './paths.js';
import type { OsContext } from './types.js';

/**
 * Cline adapter (S14.1). Cline is a VS Code extension that stores its MCP servers under the `mcpServers`
 * root key in the extension's global storage; it hot-reloads (no restart). User-scope path:
 *
 *   <VS Code User dir>/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json
 *
 * where the VS Code User dir is %APPDATA%/Code/User (win), ~/Library/Application Support/Code/User
 * (mac), or $XDG_CONFIG_HOME/Code/User (linux). Cline has no project scope.
 */
export const clineAdapter = createMcpServersAdapter({
  id: 'cline',
  secretStrategy: 'shim',
  needsRestart: false,
  resolvePath(scope, _projectPath, ctx: OsContext = realOsContext()) {
    if (scope !== 'user') throw new Error('Cline only supports user scope.');
    return joinFor(
      ctx,
      userConfigDir(ctx),
      'Code',
      'User',
      'globalStorage',
      'saoudrizwan.claude-dev',
      'settings',
      'cline_mcp_settings.json',
    );
  },
});
