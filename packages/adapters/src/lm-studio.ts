import { createMcpServersAdapter } from './shared.js';
import { joinFor, realOsContext } from './paths.js';
import type { OsContext } from './types.js';

/**
 * LM Studio adapter (S19.2). LM Studio's MCP config "currently follows Cursor's `mcp.json`
 * notation" (official docs, verified July 2026): root key `mcpServers`, stdio entries as
 * `command`/`args`/`env`, remote entries as `url`/`headers` with **no `type` field**. So this
 * reuses the shared `mcpServers` factory verbatim.
 *
 * The file is a **dedicated** MCP config (LM Studio's other app settings live elsewhere), so a
 * full replace is correct — same ownership model as Cursor/Cline. Path (home-relative on every
 * OS, per the v0.3.17 release notes):
 *   - macOS/Linux: `~/.lmstudio/mcp.json`
 *   - Windows:     `%USERPROFILE%\.lmstudio\mcp.json`
 *
 * Hot-reloaded (no restart); secret strategy `shim` (Cursor-family). LM Studio also supports an
 * `auth` OAuth block for remotes, which mcpfold does not emit — `oauth` servers rely on the
 * client's own flow (S17.5).
 */
export const lmStudioAdapter = createMcpServersAdapter({
  id: 'lm-studio',
  secretStrategy: 'shim',
  needsRestart: false,
  // Cursor-compatible: native http/sse remotes with header auth (`url` + `headers`, no `type`).
  remote: { nativeHttp: true, nativeOauth: true, fieldShape: 'url' },
  resolvePath(scope, _projectPath, ctx: OsContext = realOsContext()) {
    if (scope !== 'user') throw new Error('LM Studio only supports user scope.');
    return joinFor(ctx, ctx.home, '.lmstudio', 'mcp.json');
  },
});
