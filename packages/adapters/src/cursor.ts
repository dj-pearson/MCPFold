import { createMcpServersAdapter } from './shared.js';
import { expandHome, joinFor, realOsContext } from './paths.js';
import type { OsContext } from './types.js';

/**
 * Cursor adapter (S2.2, spec §5). Root key `mcpServers`, hot-reload (no restart), default `shim`
 * secret strategy. User config lives at `~/.cursor/mcp.json`; project config at
 * `<projectPath>/.cursor/mcp.json`.
 *
 * Cursor expands `${env:NAME}` in its config, so it declares that dialect — opting a profile/server
 * into the `native-env` strategy (S19.4) folds env-scheme refs shim-free. The default stays `shim`.
 */
export const cursorAdapter = createMcpServersAdapter({
  id: 'cursor',
  secretStrategy: 'shim',
  needsRestart: false,
  // Native HTTP remotes with OAuth (verified July 2026); bare `url` + optional `headers`.
  remote: { nativeHttp: true, nativeOauth: true, fieldShape: 'url' },
  envInterpolation: (name) => '${env:' + name + '}',
  resolvePath(scope, projectPath, ctx: OsContext = realOsContext()) {
    if (scope === 'user') return joinFor(ctx, ctx.home, '.cursor', 'mcp.json');
    if (!projectPath) throw new Error('Cursor project/workspace scope requires a project path.');
    return joinFor(ctx, expandHome(projectPath, ctx.home), '.cursor', 'mcp.json');
  },
});
