import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isMcpfoldError } from '@mcpfold/core';
import { envProvider } from '@mcpfold/secrets';
import { runRun, type Spawner } from '../src/commands/run.js';

let cwd: string;

const CONFIG = `{
  "version": 1,
  "servers": {
    "local": { "transport": "stdio", "command": "my-server", "args": ["-y", "pkg@latest"], "pin": "2.0.0", "env": { "API_TOKEN": "\${env:MY_TOKEN}" }, "tags": ["t"] },
    "remote": { "transport": "http", "url": "https://api.example/mcp/", "auth": { "type": "bearer", "token": "\${env:MY_TOKEN}" }, "tags": ["t"] }
  },
  "profiles": { "c": { "client": "cursor", "scope": "user", "include": ["t"] } }
}`;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'mcpfold-run-'));
  writeFileSync(join(cwd, 'mcp.config.jsonc'), CONFIG);
});
afterEach(() => rmSync(cwd, { recursive: true, force: true }));

describe('runRun (S4.7)', () => {
  it('resolves the secret, injects env, applies pin, and execs the real command', async () => {
    const captured: { command?: string; args?: string[]; env?: NodeJS.ProcessEnv } = {};
    const spawnFn: Spawner = vi.fn(async (command, args, env) => {
      captured.command = command;
      captured.args = args;
      captured.env = env;
      return 0;
    });
    const code = await runRun({
      cwd,
      name: 'local',
      providers: [envProvider({ MY_TOKEN: 's3cr3t' })],
      spawnFn,
    });
    expect(code).toBe(0);
    expect(captured.command).toBe('my-server');
    // @latest rewritten to the pinned version.
    expect(captured.args).toEqual(['-y', 'pkg@2.0.0']);
    // Secret injected into the child env, resolved from the ref.
    expect(captured.env?.API_TOKEN).toBe('s3cr3t');
  });

  it('bridges a remote server via mcp-remote with the resolved Authorization header', async () => {
    let args: string[] = [];
    const spawnFn: Spawner = async (_c, a) => {
      args = a;
      return 0;
    };
    await runRun({ cwd, name: 'remote', providers: [envProvider({ MY_TOKEN: 'tok' })], spawnFn });
    expect(args[0]).toBe('-y');
    expect(args).toContain('mcp-remote');
    expect(args).toContain('Authorization: Bearer tok');
  });

  it('propagates the child exit code', async () => {
    const spawnFn: Spawner = async () => 42;
    expect(
      await runRun({ cwd, name: 'local', providers: [envProvider({ MY_TOKEN: 'x' })], spawnFn }),
    ).toBe(42);
  });

  it('fails closed on resolution error without leaking (never spawns)', async () => {
    const spawnFn = vi.fn<Spawner>(async () => 0);
    await expect(
      runRun({ cwd, name: 'local', providers: [envProvider({})], spawnFn }),
    ).rejects.toSatisfy((e) => isMcpfoldError(e) && e.code === 'SECRET_RESOLUTION');
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it('errors clearly for an unknown server name', async () => {
    await expect(runRun({ cwd, name: 'nope', providers: [] })).rejects.toThrow(/No server "nope"/);
  });
});
