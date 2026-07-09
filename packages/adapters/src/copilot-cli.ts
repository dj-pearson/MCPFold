import { createMcpServersAdapter } from './shared.js';
import { joinFor, realOsContext } from './paths.js';
import type { OsContext } from './types.js';

/**
 * GitHub Copilot CLI adapter (S19.2) — the standalone `copilot` agent (GA late 2025), not the
 * legacy `gh copilot` extension. MCP servers live in a **dedicated** `mcp-config.json` under the
 * Copilot home dir (official GitHub docs, verified July 2026); other Copilot settings live in
 * sibling files (`settings.json`, `config.json`, …), so a full replace of `mcp-config.json` is
 * correct.
 *
 *   - default:  `~/.copilot/mcp-config.json`   (`%USERPROFILE%\.copilot\mcp-config.json` on win)
 *   - override: `$COPILOT_HOME/mcp-config.json`
 *
 * Copilot's entries carry an explicit **`type`** (`stdio` for local, `http` for remote) alongside
 * `command`/`args`/`env` or `url`/`headers`, matching the shared factory's `includeType` shape
 * (`type: 'stdio' | 'http' | 'sse'`). An optional per-entry `tools` allowlist exists; mcpfold
 * curates tools through the run shim rather than the client file, so it is left unset (defaults to
 * all). Hot-reloaded (no restart); secret strategy `shim`.
 */
export const copilotCliAdapter = createMcpServersAdapter({
  id: 'copilot-cli',
  secretStrategy: 'shim',
  needsRestart: false,
  includeType: true,
  // Native http remotes with header auth; entries name the transport via `type`.
  remote: { nativeHttp: true, nativeOauth: true, fieldShape: 'type+url' },
  resolvePath(scope, _projectPath, ctx: OsContext = realOsContext()) {
    if (scope !== 'user') throw new Error('Copilot CLI only supports user scope.');
    const home = ctx.env.COPILOT_HOME ?? joinFor(ctx, ctx.home, '.copilot');
    return joinFor(ctx, home, 'mcp-config.json');
  },
});
