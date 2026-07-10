import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  loadConfigOrThrow,
  resolveProfile,
  type ClientId,
  type ResolvedServer,
} from '@mcpfold/core';
import type { ClientAdapter, OsContext } from '../src/types.js';
import { cursorAdapter } from '../src/cursor.js';
import { claudeDesktopAdapter } from '../src/claude-desktop.js';
import { claudeCodeAdapter } from '../src/claude-code.js';
import { vscodeAdapter } from '../src/vscode.js';
import { windsurfAdapter } from '../src/windsurf.js';
import { zedAdapter } from '../src/zed.js';
import { clineAdapter } from '../src/cline.js';
import { geminiCliAdapter } from '../src/gemini-cli.js';
import { jetbrainsAdapter } from '../src/jetbrains.js';
import { visualStudioAdapter } from '../src/visual-studio.js';
import { continueAdapter } from '../src/continue.js';
import { rooCodeAdapter } from '../src/roo-code.js';
import { gooseAdapter } from '../src/goose.js';
import { codexCliAdapter } from '../src/codex-cli.js';
import { lmStudioAdapter } from '../src/lm-studio.js';
import { warpAdapter } from '../src/warp.js';
import { opencodeAdapter } from '../src/opencode.js';
import { copilotCliAdapter } from '../src/copilot-cli.js';

/**
 * Cross-adapter fixture harness (S2.8). A single canonical fixture is folded through every
 * adapter; each produces a committed golden native file (snapshot mismatch fails CI) and
 * must reconstruct the canonical subset via parse().
 *
 * To update goldens intentionally, run: `pnpm --filter @mcpfold/adapters test -u`
 * (never `-u` in CI — CI runs the plain `test` script).
 */

const canonicalText = readFileSync(
  fileURLToPath(new URL('./fixtures/canonical.jsonc', import.meta.url)),
  'utf8',
);
const config = loadConfigOrThrow(canonicalText);

const linux: OsContext = { platform: 'linux', home: '/home/dev', env: {} };

function serversFor(client: ClientId): ResolvedServer[] {
  // Reuse the canonical "everywhere" profile's servers, retargeted to each client.
  return resolveProfile(config, 'everywhere').map((s) => ({ ...s, client }));
}

const ADAPTERS: { adapter: ClientAdapter; golden: string }[] = [
  { adapter: claudeCodeAdapter, golden: 'fixtures/matrix/claude-code.json' },
  { adapter: claudeDesktopAdapter, golden: 'fixtures/matrix/claude-desktop.json' },
  { adapter: cursorAdapter, golden: 'fixtures/matrix/cursor.json' },
  { adapter: vscodeAdapter, golden: 'fixtures/matrix/vscode.json' },
  { adapter: windsurfAdapter, golden: 'fixtures/matrix/windsurf.json' },
  { adapter: zedAdapter, golden: 'fixtures/matrix/zed.json' },
  { adapter: clineAdapter, golden: 'fixtures/matrix/cline.json' },
  { adapter: geminiCliAdapter, golden: 'fixtures/matrix/gemini-cli.json' },
  { adapter: jetbrainsAdapter, golden: 'fixtures/matrix/jetbrains.json' },
  { adapter: visualStudioAdapter, golden: 'fixtures/matrix/visual-studio.json' },
  { adapter: continueAdapter, golden: 'fixtures/matrix/continue.json' },
  { adapter: rooCodeAdapter, golden: 'fixtures/matrix/roo-code.json' },
  { adapter: gooseAdapter, golden: 'fixtures/matrix/goose.yaml' },
  { adapter: codexCliAdapter, golden: 'fixtures/matrix/codex-cli.toml' },
  { adapter: lmStudioAdapter, golden: 'fixtures/matrix/lm-studio.json' },
  { adapter: warpAdapter, golden: 'fixtures/matrix/warp.json' },
  { adapter: opencodeAdapter, golden: 'fixtures/matrix/opencode.json' },
  { adapter: copilotCliAdapter, golden: 'fixtures/matrix/copilot-cli.json' },
];

describe('cross-adapter matrix (S2.8)', () => {
  for (const { adapter, golden } of ADAPTERS) {
    it(`${adapter.id}: renders the canonical fixture to its committed golden`, async () => {
      const file = adapter.render(serversFor(adapter.id), linux);
      await expect(file.contents).toMatchFileSnapshot(golden);
    });

    it(`${adapter.id}: render → parse reconstructs the canonical server subset`, () => {
      const file = adapter.render(serversFor(adapter.id), linux);
      const parsed = adapter.parse(file.contents);
      // The stdio server round-trips exactly for every adapter.
      expect(parsed.servers?.playwright).toEqual({
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@playwright/mcp@latest'],
        env: { HEADLESS: 'true' },
        tags: [],
      });
      // The remote server recovers at least its transport + a URL for every adapter.
      expect(
        parsed.servers?.github?.transport === 'streamable-http' ||
          parsed.servers?.github?.transport === 'sse',
      ).toBe(true);
      expect(typeof parsed.servers?.github?.url).toBe('string');
    });
  }

  it('covers every registered adapter', () => {
    expect(ADAPTERS).toHaveLength(18);
  });
});
