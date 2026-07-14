import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig, isSecretRef } from '@mcpfold/core';
import type { OsContext } from '@mcpfold/adapters';
import { runSecretExtract } from '../src/commands/secret.js';
import { runSync } from '../src/commands/sync.js';
import { runDoctor } from '../src/commands/doctor.js';
import { listBackups } from '../src/io/backup.js';

/**
 * S25.3 — `mcpfold secret extract <server>`. Moves a hardcoded token into a provider reference: the
 * config is rewritten to `${scheme:path}`, dotenv persists the value, other schemes print a
 * placeholder command, the raw value never appears in output, and on the next sync the value stays
 * off the client file.
 */

const SECRET = 'ghp_SUPERSECRETVALUE123';
let cwd: string;
let home: string;
let ctx: OsContext;
const NOW = new Date('2026-07-13T12:00:00Z');

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'mcpfold-ext-'));
  home = mkdtempSync(join(tmpdir(), 'mcpfold-exthome-'));
  ctx = { platform: 'linux', home, env: {} };
});
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

const configPath = () => join(cwd, 'mcp.config.jsonc');
const write = (text: string) => writeFileSync(configPath(), text);

/** A stdio server with a hardcoded token in env, folded to Cursor. */
function plantHardcoded(): void {
  write(`{
    "version": 1,
    // keep this comment to prove structural edits preserve it
    "servers": {
      "gh": { "transport": "stdio", "command": "x", "env": { "API_TOKEN": "${SECRET}" }, "tags": ["t"] }
    },
    "profiles": { "cursor": { "client": "cursor", "scope": "user", "include": ["t"] } }
  }`);
}

describe('runSecretExtract (S25.3)', () => {
  it('dotenv: rewrites the config to a ref, persists the value to .env, preserves comments', async () => {
    plantHardcoded();
    const res = await runSecretExtract({
      cwd,
      server: 'gh',
      scheme: 'dotenv',
      now: NOW,
      osContext: ctx,
    });

    expect(res.data.wrote).toBe(true);
    expect(res.data.extracted).toHaveLength(1);
    expect(res.data.extracted[0]).toMatchObject({
      field: 'env',
      key: 'API_TOKEN',
      ref: '${dotenv:API_TOKEN}',
      scheme: 'dotenv',
    });

    // Config now holds a reference, not the literal, and re-validates.
    const text = readFileSync(configPath(), 'utf8');
    const loaded = loadConfig(text);
    expect(loaded.ok).toBe(true);
    expect(loaded.ok && isSecretRef(loaded.config.servers.gh!.env!.API_TOKEN!)).toBe(true);
    expect(text).not.toContain(SECRET); // the literal is gone from the config
    expect(text).toContain('keep this comment'); // the comment survived the structural edit

    // The value moved to .env, and a config backup exists.
    const env = readFileSync(join(cwd, '.env'), 'utf8');
    expect(env).toContain(`API_TOKEN=${SECRET}`);
    expect(res.data.backup).toBeTruthy();
    expect(listBackups(configPath())).toHaveLength(1);

    // doctor no longer flags a hardcoded secret.
    expect(
      runDoctor({ cwd, osContext: ctx }).data.findings.some((f) => f.where?.includes('API_TOKEN')),
    ).toBe(false);
  });

  it('never prints the raw value; non-dotenv schemes emit a placeholder command + warning', async () => {
    plantHardcoded();
    const res = await runSecretExtract({
      cwd,
      server: 'gh',
      scheme: 'keychain',
      now: NOW,
      osContext: ctx,
    });

    expect(res.data.extracted[0]!.ref).toBe('${keychain:API_TOKEN}');
    expect(res.data.extracted[0]!.storedTo).toBeNull();
    expect(res.data.extracted[0]!.storeCommand).toContain('<value>'); // placeholder, not the real value
    // The value never appears anywhere in the output or payload.
    expect(res.human).not.toContain(SECRET);
    expect(JSON.stringify(res.data)).not.toContain(SECRET);
    expect((res.warnings ?? []).join('\n')).not.toContain(SECRET);
    expect((res.warnings ?? []).some((w) => w.includes('NOT stored automatically'))).toBe(true);
    // No .env is written for a non-dotenv scheme.
    expect(existsSync(join(cwd, '.env'))).toBe(false);
  });

  it('the extracted value never lands in the client file on the next sync', async () => {
    plantHardcoded();
    await runSecretExtract({ cwd, server: 'gh', scheme: 'dotenv', now: NOW, osContext: ctx });
    await runSync({ cwd, osContext: ctx, now: NOW });
    const clientFile = join(home, '.cursor', 'mcp.json');
    const contents = readFileSync(clientFile, 'utf8');
    expect(contents).not.toContain(SECRET);
    // It folds through the run shim, which resolves the ref at launch.
    expect(contents).toContain('mcpfold');
    expect(contents).toContain('run');
  });

  it('dry-run writes nothing (no config change, no .env, no backup)', async () => {
    plantHardcoded();
    const before = readFileSync(configPath(), 'utf8');
    const res = await runSecretExtract({
      cwd,
      server: 'gh',
      scheme: 'dotenv',
      dryRun: true,
      osContext: ctx,
    });

    expect(res.data.wrote).toBe(false);
    expect(res.data.extracted).toHaveLength(1); // still shows the plan
    expect(readFileSync(configPath(), 'utf8')).toBe(before);
    expect(existsSync(join(cwd, '.env'))).toBe(false);
    expect(listBackups(configPath())).toEqual([]);
    expect(res.human).not.toContain(SECRET);
  });

  it('extracts a header secret and can scope to a single --key', async () => {
    write(`{
      "version": 1,
      "servers": {
        "gh": { "transport": "streamable-http", "url": "https://x/mcp", "auth": { "type": "bearer", "headers": { "X-Api-Key": "${SECRET}", "X-Trace": "not-a-secret-name" } }, "tags": ["t"] }
      },
      "profiles": {}
    }`);
    const res = await runSecretExtract({
      cwd,
      server: 'gh',
      scheme: 'dotenv',
      key: 'X-Api-Key',
      now: NOW,
      osContext: ctx,
    });
    expect(res.data.extracted).toHaveLength(1);
    expect(res.data.extracted[0]).toMatchObject({
      field: 'auth.headers',
      key: 'X-Api-Key',
      ref: '${dotenv:X_API_KEY}',
    });
    // dotenv key is the sanitized name.
    expect(readFileSync(join(cwd, '.env'), 'utf8')).toContain(`X_API_KEY=${SECRET}`);
  });

  it('reports cleanly when the server has no hardcoded secrets', async () => {
    write(`{
      "version": 1,
      "servers": { "gh": { "transport": "stdio", "command": "x", "env": { "API_TOKEN": "\${env:GH}" }, "tags": ["t"] } },
      "profiles": {}
    }`);
    const res = await runSecretExtract({ cwd, server: 'gh', scheme: 'dotenv', osContext: ctx });
    expect(res.data.extracted).toEqual([]);
    expect(res.data.wrote).toBe(false);
    expect(res.human).toContain('No hardcoded secrets');
  });

  it('errors on an unknown server', async () => {
    plantHardcoded();
    await expect(
      runSecretExtract({ cwd, server: 'nope', scheme: 'dotenv', osContext: ctx }),
    ).rejects.toThrow(/No server named "nope"/);
  });
});
