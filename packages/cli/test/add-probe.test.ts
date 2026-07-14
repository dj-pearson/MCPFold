import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '@mcpfold/core';
import { runAdd, type UrlProber } from '../src/commands/add.js';

/**
 * S25.4 — `mcpfold add --url <url> --probe`. The opt-in probe auto-detects transport and whether auth
 * is required, scaffolding the right entry. It is best-effort and offline-by-default: without --probe
 * nothing touches the network, and any probe failure falls back to the current defaults. The prober is
 * injected here so no real network call happens.
 */

let cwd: string;
beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'mcpfold-probe-'));
  // A minimal valid canonical config to add into.
  writeFileSync(join(cwd, 'mcp.config.jsonc'), `{ "version": 1, "servers": {}, "profiles": {} }`);
});
afterEach(() => rmSync(cwd, { recursive: true, force: true }));

const readServer = (name: string) => {
  const loaded = loadConfig(readFileSync(join(cwd, 'mcp.config.jsonc'), 'utf8'));
  if (!loaded.ok) throw new Error('config invalid');
  return loaded.config.servers[name]!;
};

const prober =
  (result: Awaited<ReturnType<UrlProber>>): UrlProber =>
  async () =>
    result;

describe('add --probe (S25.4)', () => {
  it('detects streamable-http and scaffolds a placeholder auth ref on a 401', async () => {
    const res = await runAdd({
      cwd,
      name: 'gh',
      url: 'https://api.example/mcp',
      probe: true,
      prober: prober({ transport: 'streamable-http', authRequired: true }),
    });
    const server = readServer('gh');
    expect(server.transport).toBe('streamable-http');
    expect(server.auth?.type).toBe('bearer');
    // A placeholder ref — never a value — the user must fill in.
    expect(server.auth?.token).toBe('${env:GH_TOKEN}');
    expect(res.human).toContain('detected streamable-http');
    expect(res.human).toContain('auth required');
  });

  it('detects the legacy sse transport and adds no auth when unchallenged', async () => {
    await runAdd({
      cwd,
      name: 'legacy',
      url: 'https://api.example/sse',
      probe: true,
      prober: prober({ transport: 'sse', authRequired: false }),
    });
    const server = readServer('legacy');
    expect(server.transport).toBe('sse');
    expect(server.auth).toBeUndefined();
  });

  it('an explicit --transport wins over the probe', async () => {
    await runAdd({
      cwd,
      name: 'forced',
      url: 'https://api.example/mcp',
      transport: 'sse',
      probe: true,
      prober: prober({ transport: 'streamable-http', authRequired: false }),
    });
    expect(readServer('forced').transport).toBe('sse');
  });

  it('falls back to the default transport (no crash, no auth) when the probe fails', async () => {
    const res = await runAdd({
      cwd,
      name: 'down',
      url: 'https://unreachable.example/mcp',
      probe: true,
      prober: prober(null), // network error / timeout / ambiguous
    });
    const server = readServer('down');
    expect(server.transport).toBe('streamable-http'); // the S17.5 default
    expect(server.auth).toBeUndefined();
    expect(res.human).toContain('kept defaults');
  });

  it('without --probe the add is unchanged and never calls the prober (offline)', async () => {
    let probedCalled = false;
    const spyProber: UrlProber = async () => {
      probedCalled = true;
      return { transport: 'sse', authRequired: true };
    };
    await runAdd({ cwd, name: 'offline', url: 'https://api.example/mcp', prober: spyProber });
    expect(probedCalled).toBe(false);
    const server = readServer('offline');
    expect(server.transport).toBe('streamable-http');
    expect(server.auth).toBeUndefined();
  });

  it('probing does not change what sync would fold: the written server is byte-identical to a plain add', async () => {
    // Probe result that matches the default transport + no auth → the written entry must equal a
    // no-probe add, proving the probe only informs authoring and never diverges the config shape.
    await runAdd({
      cwd,
      name: 'a',
      url: 'https://api.example/mcp',
      probe: true,
      prober: prober({ transport: 'streamable-http', authRequired: false }),
    });
    const probed = JSON.stringify(readServer('a'));

    writeFileSync(join(cwd, 'mcp.config.jsonc'), `{ "version": 1, "servers": {}, "profiles": {} }`);
    await runAdd({ cwd, name: 'a', url: 'https://api.example/mcp' });
    const plain = JSON.stringify(readServer('a'));

    expect(probed).toBe(plain);
  });
});
