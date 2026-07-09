import { expandHome, joinFor, realOsContext } from './paths.js';
import type { ClientAdapter, OsContext } from './types.js';
import { vscodeAdapter } from './vscode.js';

/**
 * Visual Studio adapter (S19.1). Visual Studio (2026-05 docs) reads MCP config in the
 * **VS Code dialect** — root key `servers`, plus a top-level `inputs` array for prompted
 * secrets — so it *reuses the VS Code render/parse verbatim* and only overrides path
 * resolution (secret strategy `native-input`, no restart).
 *
 * VS resolves servers from several files, in precedence order:
 *   `%USERPROFILE%\.mcp.json`, `<SOLUTIONDIR>\.mcp.json`, `.vs\mcp.json`, `.vscode\mcp.json`,
 *   `.cursor\mcp.json`.
 *
 * Two of those (`.vscode/mcp.json`, `.cursor/mcp.json`) are already OWNED by the vscode and
 * cursor adapters. To avoid two adapters writing the same file, this adapter deliberately
 * targets the VS-specific files no other adapter touches:
 *   - user:    `~/.mcp.json`               (== `%USERPROFILE%\.mcp.json`)
 *   - project: `<projectPath>/.mcp.json`   (== `<SOLUTIONDIR>\.mcp.json`)
 *
 * A machine that also has the vscode/cursor adapters synced will therefore have VS pick up
 * whichever file wins its own precedence — never a double-write conflict from mcpfold.
 */
export const visualStudioAdapter: ClientAdapter = {
  ...vscodeAdapter,
  id: 'visual-studio',

  resolvePath(scope, projectPath, ctx: OsContext = realOsContext()) {
    if (scope === 'user') return joinFor(ctx, ctx.home, '.mcp.json');
    if (!projectPath) throw new Error('Visual Studio solution scope requires a project path.');
    return joinFor(ctx, expandHome(projectPath, ctx.home), '.mcp.json');
  },
};
