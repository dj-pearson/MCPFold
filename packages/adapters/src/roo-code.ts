import { createMcpServersAdapter } from './shared.js';
import { expandHome, joinFor, realOsContext, userConfigDir } from './paths.js';
import type { OsContext } from './types.js';

/**
 * Roo Code adapter (S19.1). Roo Code is a VS Code extension (a Cline fork) that reads MCP
 * servers under the `mcpServers` root at two levels (verified against Roo Code docs, July
 * 2026):
 *   - user (global):  `<VS Code User>/globalStorage/rooveterinaryinc.roo-cline/settings/cline_mcp_settings.json`
 *   - project:        `<projectPath>/.roo/mcp.json`
 *
 * (The global file keeps Cline's original `cline_mcp_settings.json` name; the publisher id
 * is `rooveterinaryinc.roo-cline`.) The VS Code User dir is `%APPDATA%/Code/User` (win),
 * `~/Library/Application Support/Code/User` (mac), or `$XDG_CONFIG_HOME/Code/User` (linux).
 * Project config takes precedence over global on a name clash. Hot-reloaded (no restart);
 * secret strategy `shim` (Cline-family, matching the Cline adapter).
 */
export const rooCodeAdapter = createMcpServersAdapter({
  id: 'roo-code',
  secretStrategy: 'shim',
  needsRestart: false,
  resolvePath(scope, projectPath, ctx: OsContext = realOsContext()) {
    if (scope === 'user') {
      return joinFor(
        ctx,
        userConfigDir(ctx),
        'Code',
        'User',
        'globalStorage',
        'rooveterinaryinc.roo-cline',
        'settings',
        'cline_mcp_settings.json',
      );
    }
    if (!projectPath) throw new Error('Roo Code project scope requires a project path.');
    return joinFor(ctx, expandHome(projectPath, ctx.home), '.roo', 'mcp.json');
  },
});
