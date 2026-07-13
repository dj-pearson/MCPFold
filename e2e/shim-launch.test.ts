import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cursorAdapter, type OsContext } from '@mcpfold/adapters';
import { runRun, runSync, type Spawner, type TrustGate } from 'mcpfold';

/**
 * Shim launch e2e: GUI clients (Claude Desktop, etc.) spawn MCP servers from an arbitrary
 * working directory — often `/` or the app's install dir — never the project that holds
 * mcp.config.jsonc. Sync embeds `--cwd <configDir>` into every folded shim so `mcpfold run`
 * still finds the canonical config AND resolves `.env`-adjacent secrets from the right place.
 * Runs with the REAL platform's paths (Windows backslashes included) on the CI matrix.
 */

// The server's secret is a dotenv ref: resolving it requires the CONFIG directory's .env,
// so this test fails unless the embedded --cwd travels all the way through the launch.
const CONFIG = `{
  "version": 1,
  "servers": {
    "github": { "transport": "stdio", "command": "gh-mcp", "args": ["serve"], "env": { "TOKEN": "\${dotenv:GH_TOKEN}" }, "tags": ["work"] }
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
  cwd = mkdtempSync(join(tmpdir(), 'mcpfold-e2e-shim-cwd-'));
  home = mkdtempSync(join(tmpdir(), 'mcpfold-e2e-shim-home-'));
  writeFileSync(join(cwd, 'mcp.config.jsonc'), CONFIG);
  writeFileSync(join(cwd, '.env'), 'GH_TOKEN=tok-from-project-dotenv\n');
  ctx = {
    platform: process.platform,
    home,
    env: { APPDATA: join(home, 'AppData', 'Roaming'), XDG_CONFIG_HOME: join(home, '.config') },
  };
});
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

describe('shim launch from an arbitrary cwd (GUI clients)', () => {
  it('sync → shim carries --cwd → launch from elsewhere still resolves config and .env', async () => {
    await runSync({ cwd, osContext: ctx });

    const written = JSON.parse(
      readFileSync(cursorAdapter.resolvePath('user', undefined, ctx), 'utf8'),
    );
    const shim = written.mcpServers.github;
    expect(shim.command).toBe('mcpfold');
    expect(shim.args).toEqual(['run', 'github', '--cwd', resolve(cwd)]);
    // The secret VALUE never lands in the client file — only the shim indirection does.
    expect(JSON.stringify(written)).not.toContain('tok-from-project-dotenv');

    // Launch exactly as a GUI client would: this process's cwd is NOT the config directory;
    // the only pointer back to it is the --cwd embedded in the rendered args.
    expect(resolve(process.cwd())).not.toBe(resolve(cwd));
    const embeddedCwd: string = shim.args[shim.args.indexOf('--cwd') + 1];

    const captured: { command?: string; args?: string[]; env?: NodeJS.ProcessEnv } = {};
    const spawnFn: Spawner = async (command, args, env) => {
      captured.command = command;
      captured.args = args;
      captured.env = env;
      return 0;
    };
    const code = await runRun({ cwd: embeddedCwd, name: 'github', spawnFn, trust: trustAll });

    expect(code).toBe(0);
    expect(captured.command).toBe('gh-mcp');
    expect(captured.args).toEqual(['serve']);
    // The dotenv ref resolved against the CONFIG directory's .env, not the launch cwd's.
    expect(captured.env?.TOKEN).toBe('tok-from-project-dotenv');
  });
});
