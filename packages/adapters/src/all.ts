import { registerAdapter } from './registry.js';
import { cursorAdapter } from './cursor.js';
import { claudeDesktopAdapter } from './claude-desktop.js';
import { claudeCodeAdapter } from './claude-code.js';
import { vscodeAdapter } from './vscode.js';
import { windsurfAdapter } from './windsurf.js';
import { zedAdapter } from './zed.js';
import { clineAdapter } from './cline.js';
import { geminiCliAdapter } from './gemini-cli.js';
import { jetbrainsAdapter } from './jetbrains.js';
import { visualStudioAdapter } from './visual-studio.js';
import { continueAdapter } from './continue.js';
import { rooCodeAdapter } from './roo-code.js';
import { gooseAdapter } from './goose.js';
import { codexCliAdapter } from './codex-cli.js';
import { lmStudioAdapter } from './lm-studio.js';
import { warpAdapter } from './warp.js';
import { opencodeAdapter } from './opencode.js';
import { copilotCliAdapter } from './copilot-cli.js';
import type { ClientAdapter } from './types.js';

/** Every built-in adapter, in a stable order. */
export const ALL_ADAPTERS: readonly ClientAdapter[] = [
  claudeCodeAdapter,
  claudeDesktopAdapter,
  cursorAdapter,
  vscodeAdapter,
  windsurfAdapter,
  zedAdapter,
  clineAdapter,
  geminiCliAdapter,
  jetbrainsAdapter,
  visualStudioAdapter,
  continueAdapter,
  rooCodeAdapter,
  gooseAdapter,
  codexCliAdapter,
  lmStudioAdapter,
  warpAdapter,
  opencodeAdapter,
  copilotCliAdapter,
];

/** Register every built-in adapter into the shared registry. Idempotent. */
export function registerAll(): void {
  for (const adapter of ALL_ADAPTERS) registerAdapter(adapter);
}
