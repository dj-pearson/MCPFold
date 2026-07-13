import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OsContext } from '@mcpfold/adapters';
import { envProvider } from '@mcpfold/secrets';
import { runSync } from '../src/commands/sync.js';
import { runRun, type Spawner } from '../src/commands/run.js';
import { run } from '../src/cli.js';
import type { TrustGate } from '../src/trust/tofu.js';
import type { Writer } from '../src/output/render.js';

/**
 * Shim launch-cwd regression tests. GUI clients (Claude Desktop, etc.) spawn MCP servers from an
 * arbitrary working directory — often `/` or the app dir — while `mcpfold run` resolves the
 * canonical config from its cwd. Sync therefore embeds `--cwd <configDir>` into every shim it
 * renders; these tests walk the full loop: fold → rendered shim args → launch from elsewhere.
 */

// A secret-bearing stdio server, so it folds via the shim (not rendered natively).
const CONFIG = `{
  "version": 1,
  "servers": {
    "github": { "transport": "stdio", "command": "gh-mcp", "args": ["serve"], "env": { "TOKEN": "\${env:GH_TOKEN}" }, "tags": ["work"] }
  },
  "profiles": {
    "cursor-user": { "client": "cursor", "scope": "user", "include": ["work"] }
  }
}`;

const trustAll: TrustGate = {
  status: () => 'trusted',
  isTrusted: () => true,
  approve: () => {},
  trustedTools: () => undefined,
  toolsStatus: () => 'unpinned',
  approveTools: () => {},
};

let cwd: string;
let home: string;
let ctx: OsContext;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'mcpfold-shim-cwd-'));
  home = mkdtempSync(join(tmpdir(), 'mcpfold-shim-home-'));
  writeFileSync(join(cwd, 'mcp.config.jsonc'), CONFIG);
  ctx = { platform: 'linux', home, env: {} };
});
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

describe('shim survives an arbitrary launch cwd (GUI clients)', () => {
  it('sync embeds the absolute config directory as `--cwd` in the rendered shim', async () => {
    await runSync({ cwd, osContext: ctx });
    const written = JSON.parse(readFileSync(join(home, '.cursor', 'mcp.json'), 'utf8'));
    expect(written.mcpServers.github).toEqual({
      command: 'mcpfold',
      args: ['run', 'github', '--cwd', resolve(cwd)],
    });
  });

  it('the rendered shim starts the server even when launched from a different cwd', async () => {
    await runSync({ cwd, osContext: ctx });
    const written = JSON.parse(readFileSync(join(home, '.cursor', 'mcp.json'), 'utf8'));
    const args: string[] = written.mcpServers.github.args;

    // Simulate the GUI client: this test process's cwd is NOT the config directory, exactly
    // like Claude Desktop launching from / — the only pointer back is the embedded --cwd.
    expect(resolve(process.cwd())).not.toBe(resolve(cwd));
    const embeddedCwd = args[args.indexOf('--cwd') + 1]!;

    const spawnFn: Spawner = vi.fn(async () => 0);
    const code = await runRun({
      cwd: embeddedCwd,
      name: args[1]!,
      providers: [envProvider({ GH_TOKEN: 's3cr3t' })],
      spawnFn,
      trust: trustAll,
    });
    expect(code).toBe(0);
    expect(spawnFn).toHaveBeenCalledWith(
      'gh-mcp',
      ['serve'],
      expect.objectContaining({ TOKEN: 's3cr3t' }),
    );
  });

  it('without --cwd the same launch fails — the failure mode the embedding fixes', async () => {
    const guiClientCwd = mkdtempSync(join(tmpdir(), 'mcpfold-elsewhere-'));
    try {
      await expect(
        runRun({ cwd: guiClientCwd, name: 'github', spawnFn: async () => 0, trust: trustAll }),
      ).rejects.toThrow(/No mcp\.config\.jsonc found/);
    } finally {
      rmSync(guiClientCwd, { recursive: true, force: true });
    }
  });

  it('the real CLI accepts `--cwd` AFTER the server name, as the shim passes it', async () => {
    // `mcpfold run ghost --cwd <dir>`: the config IS found (so no "No mcp.config.jsonc found"),
    // proving commander honors the trailing --cwd; the unknown name is the expected error.
    const out: string[] = [];
    const err: string[] = [];
    const writer: Writer = { out: (t) => out.push(t), err: (t) => err.push(t) };
    await run(['run', 'ghost', '--cwd', cwd], writer);
    const stderr = err.join('');
    expect(stderr).toContain('No server "ghost"');
    expect(stderr).not.toContain('No mcp.config.jsonc found');
  });
});
