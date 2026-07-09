/**
 * @mcpfold/adapters — one module per client. This index exposes the adapter framework
 * (interface, registry, shared helpers, path helpers). Concrete client adapters
 * (S2.2–S2.7) register themselves here as they are implemented.
 */

export type { ClientAdapter, OsContext, RenderedFile, SecretStrategy } from './types.js';

export { expandHome, joinFor, pathFor, realOsContext, userConfigDir } from './paths.js';

export {
  createMcpServersAdapter,
  fromMcpServersShape,
  toMcpEntry,
  toMcpServersShape,
  type McpRemoteEntry,
  type McpServerEntry,
  type McpServersAdapterConfig,
  type McpStdioEntry,
  type ToEntryOptions,
} from './shared.js';

export {
  clearAdapters,
  getAdapter,
  listAdapters,
  registerAdapter,
  requireAdapter,
} from './registry.js';

// Concrete client adapters (S2.2–S2.7, S14.1, S19.1)
export { cursorAdapter } from './cursor.js';
export { claudeDesktopAdapter } from './claude-desktop.js';
export { claudeCodeAdapter } from './claude-code.js';
export { vscodeAdapter } from './vscode.js';
export { windsurfAdapter } from './windsurf.js';
export { zedAdapter } from './zed.js';
export { clineAdapter } from './cline.js';
export { geminiCliAdapter } from './gemini-cli.js';
export { jetbrainsAdapter } from './jetbrains.js';
export { visualStudioAdapter } from './visual-studio.js';
export { continueAdapter } from './continue.js';
export { rooCodeAdapter } from './roo-code.js';
export { ALL_ADAPTERS, registerAll } from './all.js';
