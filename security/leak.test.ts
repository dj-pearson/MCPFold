import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfigOrThrow, type ResolvedServer } from '@mcpfold/core';
import {
  cursorAdapter,
  claudeCodeAdapter,
  claudeDesktopAdapter,
  vscodeAdapter,
  windsurfAdapter,
  zedAdapter,
  createMcpServersAdapter,
  type OsContext,
} from '@mcpfold/adapters';
import { runSync, runRun, renderWithStrategy, type Spawner } from 'mcpfold';
import {
  assertRefOnlyForPush,
  findRawSecretsForPush,
  scanForSentinel,
  sentinelProvider,
  SENTINEL,
} from './leak-harness.js';

let cwd: string;
let home: string;
let ctx: OsContext;

const CONFIG = `{
  "version": 1,
  "servers": {
    "github": { "transport": "http", "url": "https://api.githubcopilot.com/mcp/", "auth": { "type": "bearer", "token": "\${env:SENTINEL}" }, "tags": ["all"] },
    "local": { "transport": "stdio", "command": "srv", "env": { "API_TOKEN": "\${env:SENTINEL}" }, "tags": ["all"] }
  },
  "profiles": {
    "cursor": { "client": "cursor", "scope": "user", "include": ["all"] },
    "claude-code": { "client": "claude-code", "scope": "user", "include": ["all"] },
    "claude-desktop": { "client": "claude-desktop", "scope": "user", "include": ["all"] },
    "vscode": { "client": "vscode", "scope": "user", "include": ["all"] },
    "windsurf": { "client": "windsurf", "scope": "user", "include": ["all"] },
    "zed": { "client": "zed", "scope": "user", "include": ["all"] }
  }
}`;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'mcpfold-leak-cwd-'));
  home = mkdtempSync(join(tmpdir(), 'mcpfold-leak-home-'));
  writeFileSync(join(cwd, 'mcp.config.jsonc'), CONFIG);
  ctx = { platform: 'linux', home, env: {} };
});
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

describe('S9.1 — the sentinel appears in ZERO artifacts for shim + native-input', () => {
  it('sync across all shim + native-input adapters leaks nothing to HOME', async () => {
    // Inject the sentinel via env AND a fake provider — neither shim nor native-input resolve,
    // so the value must never materialize on disk.
    await runSync({
      cwd,
      osContext: ctx,
      providers: [sentinelProvider('env')],
    });
    expect(scanForSentinel(home)).toEqual([]);
    expect(scanForSentinel(cwd).filter((f) => !f.endsWith('mcp.config.jsonc'))).toEqual([]);
  });

  it('every adapter renders the secret server without the value', async () => {
    const server: ResolvedServer = {
      name: 'github',
      transport: 'http',
      url: 'https://api.githubcopilot.com/mcp/',
      auth: { type: 'bearer', token: '${env:SENTINEL}' },
      tags: ['all'],
      client: 'cursor',
      scope: 'user',
    };
    for (const adapter of [
      cursorAdapter,
      claudeCodeAdapter,
      claudeDesktopAdapter,
      vscodeAdapter,
      windsurfAdapter,
      zedAdapter,
    ]) {
      const file = await renderWithStrategy(adapter, [{ ...server, client: adapter.id }], {
        osContext: ctx,
        resolve: async (s) =>
          s.map((x) => ({ ...x, auth: { type: 'bearer' as const, token: SENTINEL } })),
      });
      expect(file.contents).not.toContain(SENTINEL);
    }
  });
});

describe('S9.1 — inline may hold the value ONLY in a gitignored target', () => {
  const inlineAdapter = createMcpServersAdapter({
    id: 'cursor',
    secretStrategy: 'inline',
    resolvePath: (_s, _p, c) => join((c ?? ctx).home, '.cursor', 'mcp.json'),
  });
  const server: ResolvedServer = {
    name: 'github',
    transport: 'http',
    url: 'https://x/mcp',
    auth: { type: 'bearer', token: '${env:SENTINEL}' },
    tags: [],
    client: 'cursor',
    scope: 'user',
  };
  const resolve = async (s: ResolvedServer[]): Promise<ResolvedServer[]> =>
    s.map((x) => ({ ...x, auth: { type: 'bearer' as const, token: SENTINEL } }));

  it('writes the sentinel into the gitignored target, and only there', async () => {
    const file = await renderWithStrategy(inlineAdapter, [server], {
      osContext: ctx,
      resolve,
      isGitignored: () => true,
      onWarn: () => {},
    });
    expect(file.contents).toContain(SENTINEL);
    // Simulate the write to the target and confirm the sentinel is confined to it.
    writeFileSync(join(home, 'target.json'), file.contents);
    const hits = scanForSentinel(home);
    expect(hits).toEqual([join(home, 'target.json')]);
  });

  it('refuses (does not write) when the target is not gitignored', async () => {
    await expect(
      renderWithStrategy(inlineAdapter, [server], {
        osContext: ctx,
        resolve,
        isGitignored: () => false,
      }),
    ).rejects.toThrow(/not gitignored/);
    expect(scanForSentinel(home)).toEqual([]);
  });
});

describe('S9.1 — run injects into the child env only, never to disk (memory-only)', () => {
  it('resolves the sentinel into the child env but writes it nowhere', async () => {
    let capturedEnv: NodeJS.ProcessEnv = {};
    const spawnFn: Spawner = async (_c, _a, env) => {
      capturedEnv = env;
      return 0;
    };
    await runRun({ cwd, name: 'local', providers: [sentinelProvider('env')], spawnFn });
    // Correctly injected into the child process env...
    expect(capturedEnv.API_TOKEN).toBe(SENTINEL);
    // ...but nothing was cached/written to disk (memory-only resolution).
    expect(scanForSentinel(cwd).filter((f) => !f.endsWith('mcp.config.jsonc'))).toEqual([]);
    expect(scanForSentinel(home)).toEqual([]);
    expect(readdirSync(cwd).some((f) => f.includes('.mcpfold.tmp'))).toBe(false);
  });
});

describe('S9.1 — client-side push guard rejects raw secrets', () => {
  it('accepts a ref-only config', () => {
    expect(() => assertRefOnlyForPush(loadConfigOrThrow(CONFIG))).not.toThrow();
  });

  it('rejects a config with a raw high-entropy secret in a secret position', () => {
    const bad = loadConfigOrThrow(`{
      "version": 1,
      "servers": { "s": { "transport": "stdio", "command": "x", "env": { "API_TOKEN": "ghp_abcdef1234567890ABCDEFxyz" }, "tags": ["t"] } },
      "profiles": { "c": { "client": "cursor", "scope": "user", "include": ["t"] } }
    }`);
    expect(findRawSecretsForPush(bad)).toHaveLength(1);
    expect(() => assertRefOnlyForPush(bad)).toThrow(/Refusing to push/);
  });
});

describe('S9.1 — the harness itself detects a deliberate leak (meta-test)', () => {
  it('scanForSentinel finds a planted sentinel (proves the guard works)', () => {
    writeFileSync(join(home, 'oops.json'), `{"token":"${SENTINEL}"}`);
    expect(scanForSentinel(home)).toContain(join(home, 'oops.json'));
    expect(existsSync(join(home, 'oops.json'))).toBe(true);
  });
});
