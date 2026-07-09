import { createMcpServersAdapter } from './shared.js';
import { expandHome, joinFor, realOsContext } from './paths.js';
import type { OsContext } from './types.js';

/**
 * Continue adapter (S19.1). Continue's own config is YAML (`config.yaml`), but it also
 * **auto-loads any JSON MCP file dropped into a `.continue/mcpServers/` directory** — the
 * documented migration path for Claude Desktop / Cursor / Cline users ("place your JSON MCP
 * config file at `.continue/mcpServers/mcp.json`"). That JSON uses the standard `mcpServers`
 * root, so mcpfold folds to a JSON file there and needs no YAML dependency:
 *   - user (global):  `~/.continue/mcpServers/mcpfold.json`
 *   - project:        `<projectPath>/.continue/mcpServers/mcpfold.json`
 *
 * The `mcpfold.json` filename is mcpfold-owned, so we never clobber a user's other server
 * files in that directory. No restart (hot-reloaded).
 *
 * Secret strategy `shim` for wave 1. Continue *does* have a native secret mechanism
 * (`${{ secrets.NAME }}`); folding refs into it is the job of the native-interpolation
 * strategy (S19.4), so until that lands the safe default is the shim launcher (matching
 * Cursor/Cline).
 */
export const continueAdapter = createMcpServersAdapter({
  id: 'continue',
  secretStrategy: 'shim',
  needsRestart: false,
  resolvePath(scope, projectPath, ctx: OsContext = realOsContext()) {
    if (scope === 'user') {
      return joinFor(ctx, ctx.home, '.continue', 'mcpServers', 'mcpfold.json');
    }
    if (!projectPath) throw new Error('Continue project scope requires a project path.');
    return joinFor(
      ctx,
      expandHome(projectPath, ctx.home),
      '.continue',
      'mcpServers',
      'mcpfold.json',
    );
  },
});
