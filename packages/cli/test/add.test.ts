import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig, UsageError } from '@mcpfold/core';
import { runAdd, type Prompt } from '../src/commands/add.js';

let cwd: string;
const CONFIG = `{
  // my servers
  "version": 1,
  "servers": {
    "existing": { "transport": "stdio", "command": "npx", "args": ["-y", "x"], "tags": ["a"] }
  },
  "profiles": {}
}`;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'mcpfold-add-'));
  writeFileSync(join(cwd, 'mcp.config.jsonc'), CONFIG);
});
afterEach(() => rmSync(cwd, { recursive: true, force: true }));

const read = () => readFileSync(join(cwd, 'mcp.config.jsonc'), 'utf8');

describe('runAdd (S3.4)', () => {
  it('adds an http server from --url with a token REFERENCE (never raw)', async () => {
    const result = await runAdd({
      cwd,
      name: 'github',
      url: 'https://api.githubcopilot.com/mcp/',
      tokenRef: '${env:GITHUB_PAT}',
      tags: ['work'],
    });
    expect(result.data.server.transport).toBe('streamable-http');
    expect(result.data.server.auth?.token).toBe('${env:GITHUB_PAT}');
    const text = read();
    expect(loadConfig(text).ok).toBe(true);
    // Comments in the original file are preserved by the structural edit.
    expect(text).toContain('// my servers');
  });

  it('adds a stdio npx server from --package with a pin', async () => {
    await runAdd({
      cwd,
      name: 'pw',
      package: '@playwright/mcp@latest',
      pin: '1.4.2',
      tags: ['code'],
    });
    const cfg = loadConfig(read());
    expect(cfg.ok).toBe(true);
    if (cfg.ok) {
      expect(cfg.config.servers.pw?.command).toBe('npx');
      expect(cfg.config.servers.pw?.args).toEqual(['-y', '@playwright/mcp@latest']);
      expect(cfg.config.servers.pw?.pin).toBe('1.4.2');
    }
  });

  it('rejects a raw token (must be a ${scheme:path} reference)', async () => {
    await expect(
      runAdd({ cwd, name: 'gh', url: 'https://x/mcp', tokenRef: 'ghp_rawtoken' }),
    ).rejects.toThrow(/not a secret reference/);
  });

  it('rejects a duplicate server name', async () => {
    await expect(runAdd({ cwd, name: 'existing', package: 'x' })).rejects.toThrow(/already exists/);
  });

  it('supports the interactive path via an injected prompt', async () => {
    const answers = [
      'https://api.example/mcp/', // URL
      '${env:TOKEN}', // token ref
    ];
    let i = 0;
    const prompt: Prompt = async () => answers[i++]!;
    const result = await runAdd({ cwd, name: 'iface', prompt });
    expect(result.data.server.transport).toBe('streamable-http');
    expect(result.data.server.auth?.token).toBe('${env:TOKEN}');
  });

  it('--dry-run writes nothing', async () => {
    const before = read();
    const result = await runAdd({ cwd, name: 'gh', url: 'https://x/mcp', dryRun: true });
    expect(result.data.wrote).toBe(false);
    expect(read()).toBe(before);
  });

  it('errors when there is no config', async () => {
    rmSync(join(cwd, 'mcp.config.jsonc'));
    await expect(runAdd({ cwd, name: 'x', url: 'https://x/mcp' })).rejects.toThrow(UsageError);
  });
});
