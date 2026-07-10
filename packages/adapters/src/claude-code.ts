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
  // Default `shim`; declares the `${VAR}` dialect (Claude Code expands `${VAR}`/`${VAR:-default}`
  // in .mcp.json) so a profile/server can opt into `native-env` (S19.4).
  secretStrategy: 'shim',
  needsRestart: false,
  includeType: true,
  // Native HTTP remotes with OAuth (verified July 2026); explicit `type` next to `url`.
  remote: { nativeHttp: true, nativeOauth: true, fieldShape: 'type+url' },
  envInterpolation: (name) => '${' + name + '}',
  resolvePath(scope, projectPath, ctx: OsContext = realOsContext()) {
    if (scope === 'user') return joinFor(ctx, ctx.home, '.claude.json');
    if (!projectPath) throw new Error('Claude Code project scope requires a project path.');
    return joinFor(ctx, expandHome(projectPath, ctx.home), '.mcp.json');
  },
});
