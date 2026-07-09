import { createMcpServersAdapter } from './shared.js';
import { expandHome, joinFor, realOsContext } from './paths.js';
import type { OsContext } from './types.js';

/**
 * JetBrains adapter (S19.1). JetBrains AI Assistant configures MCP servers via an in-IDE
 * dialog that takes a **`mcpServers`-shaped** paste-in JSON (Settings | Tools | AI Assistant
 * | Model Context Protocol), with an "Import from Claude" path — it does not itself persist
 * to a stable, user-editable file we can own across IDE versions.
 *
 * The JetBrains *agent* surface (Junie), however, reads the same `mcpServers` JSON from a
 * documented on-disk file, so that is what mcpfold folds to (verified against JetBrains
 * primary docs, July 2026):
 *   - user (global, all projects): `~/.junie/mcp/mcp.json`
 *   - project:                     `<projectPath>/.junie/mcp/mcp.json`
 *
 * The rendered file is byte-for-byte the JSON you would paste into the AI Assistant dialog.
 * No restart (hot-reloaded). Secret strategy `shim` — the `mcp.json` surface has no native
 * secret-input indirection (unlike VS Code's `${input:…}` + `inputs`).
 */
export const jetbrainsAdapter = createMcpServersAdapter({
  id: 'jetbrains',
  secretStrategy: 'shim',
  needsRestart: false,
  resolvePath(scope, projectPath, ctx: OsContext = realOsContext()) {
    if (scope === 'user') return joinFor(ctx, ctx.home, '.junie', 'mcp', 'mcp.json');
    if (!projectPath) throw new Error('JetBrains project scope requires a project path.');
    return joinFor(ctx, expandHome(projectPath, ctx.home), '.junie', 'mcp', 'mcp.json');
  },
});
