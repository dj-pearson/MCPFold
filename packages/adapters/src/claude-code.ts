import { createMcpServersAdapter } from './shared.js';
import { expandHome, joinFor, realOsContext } from './paths.js';
import type { OsContext } from './types.js';

/**
 * Claude Code adapter (S2.4). Root key `mcpServers` with an explicit per-server `type`
 * field (`stdio` | `http`). Changes are picked up by starting a **new session** (not an
 * app restart), so needsRestart is false. Paths:
 *   - user:    ~/.claude.json
 *   - project: <projectPath>/.mcp.json
 */
export const claudeCodeAdapter = createMcpServersAdapter({
  id: 'claude-code',
  secretStrategy: 'shim',
  needsRestart: false,
  includeType: true,
  resolvePath(scope, projectPath, ctx: OsContext = realOsContext()) {
    if (scope === 'user') return joinFor(ctx, ctx.home, '.claude.json');
    if (!projectPath) throw new Error('Claude Code project scope requires a project path.');
    return joinFor(ctx, expandHome(projectPath, ctx.home), '.mcp.json');
  },
});
