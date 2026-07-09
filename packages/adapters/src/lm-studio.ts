import { createMcpServersAdapter } from './shared.js';
import { joinFor, realOsContext } from './paths.js';
import type { OsContext } from './types.js';

/**
 * LM Studio adapter (S19.2). LM Studio reads a dedicated `mcp.json` that "follows Cursor's
 * notation" — the `mcpServers` root key with `command`/`args`/`env` for stdio and `url`/`headers`
 * for remote. A dedicated MCP-only file, so a full rewrite is fine (no unmanaged-key preservation).
 *
 * Verified July 2026 against the LM Studio docs (lmstudio.ai/docs/app/mcp). Path:
 *   - macOS/Linux/Windows: ~/.lmstudio/mcp.json
 */
export const lmStudioAdapter = createMcpServersAdapter({
  id: 'lm-studio',
  secretStrategy: 'shim',
  needsRestart: false,
  // Cursor-compatible: native http/sse remotes with header auth under `url` + `headers`.
  remote: { nativeHttp: true, nativeOauth: true, fieldShape: 'url' },
  resolvePath(scope, _projectPath, ctx: OsContext = realOsContext()) {
    if (scope !== 'user') throw new Error('LM Studio only supports user scope.');
    return joinFor(ctx, ctx.home, '.lmstudio', 'mcp.json');
  },
});
