import { createMcpServersAdapter } from './shared.js';
import { joinFor, realOsContext } from './paths.js';
import type { OsContext } from './types.js';

/**
 * Gemini CLI adapter (S14.1). The Gemini CLI reads MCP servers from the `mcpServers` root of
 * `~/.gemini/settings.json` and picks them up on the next run (no restart). User scope only.
 */
export const geminiCliAdapter = createMcpServersAdapter({
  id: 'gemini-cli',
  secretStrategy: 'shim',
  needsRestart: false,
  resolvePath(scope, _projectPath, ctx: OsContext = realOsContext()) {
    if (scope !== 'user') throw new Error('Gemini CLI only supports user scope.');
    return joinFor(ctx, ctx.home, '.gemini', 'settings.json');
  },
});
