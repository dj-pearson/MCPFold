import { registerAdapter } from './registry.js';
import { cursorAdapter } from './cursor.js';
import { claudeDesktopAdapter } from './claude-desktop.js';
import { claudeCodeAdapter } from './claude-code.js';
import { vscodeAdapter } from './vscode.js';
import { windsurfAdapter } from './windsurf.js';
import { zedAdapter } from './zed.js';
import type { ClientAdapter } from './types.js';

/** Every built-in adapter, in a stable order. */
export const ALL_ADAPTERS: readonly ClientAdapter[] = [
  claudeCodeAdapter,
  claudeDesktopAdapter,
  cursorAdapter,
  vscodeAdapter,
  windsurfAdapter,
  zedAdapter,
];

/** Register every built-in adapter into the shared registry. Idempotent. */
export function registerAll(): void {
  for (const adapter of ALL_ADAPTERS) registerAdapter(adapter);
}
