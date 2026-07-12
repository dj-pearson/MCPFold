import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Config } from '@mcpfold/core';
import { canonicalizeTools } from '@mcpfold/proxy';
import { executableSignature, memoryTrustGate, untrustedServers } from '../src/trust/tofu.js';
import { signConfig, verifyConfig } from '../src/trust/signing.js';
import { computeIntegrity, verifyPackageIntegrity } from '../src/trust/integrity.js';
import { checkPinIntegrity } from '../src/checks/servers.js';
import { runRun, type Spawner } from '../src/commands/run.js';
import { runTrust } from '../src/commands/trust.js';
import { runPull } from '../src/commands/pull.js';
import { inMemoryBackend, saveSession } from '../src/cloud/token-store.js';
import type { CloudApi, PullResponse } from '../src/cloud/api.js';

const CONFIG_TEXT = `{
  "version": 1,
  "servers": {
    "srv": { "transport": "stdio", "command": "my-server", "args": ["--go"], "tags": ["t"] }
  },
  "profiles": {}
}`;

let cwd: string;
beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'mcpfold-trust-'));
  writeFileSync(join(cwd, 'mcp.config.jsonc'), CONFIG_TEXT);
});
afterEach(() => rmSync(cwd, { recursive: true, force: true }));

describe('TOFU trust gate (S9.2)', () => {
  it('run refuses an untrusted launch command', async () => {
    const spawnFn = vi.fn<Spawner>(async () => 0);
    await expect(
      runRun({ cwd, name: 'srv', providers: [], spawnFn, trust: memoryTrustGate() }),
    ).rejects.toThrow(/not yet trusted/i);
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it('an approved entry runs without re-prompting', async () => {
    const gate = memoryTrustGate();
    // `mcpfold trust` records approval…
    runTrust({ cwd, gate });
    const spawnFn = vi.fn<Spawner>(async () => 0);
    // …and then run launches it.
    expect(await runRun({ cwd, name: 'srv', providers: [], spawnFn, trust: gate })).toBe(0);
    expect(spawnFn).toHaveBeenCalledTimes(1);
  });

  it('a CHANGED command re-triggers the gate even after the old one was trusted', async () => {
    const gate = memoryTrustGate();
    runTrust({ cwd, gate }); // trusts my-server --go
    // The user edits the command → previously-approved signature no longer matches.
    writeFileSync(join(cwd, 'mcp.config.jsonc'), CONFIG_TEXT.replace('my-server', 'evil-server'));
    const spawnFn = vi.fn<Spawner>(async () => 0);
    await expect(runRun({ cwd, name: 'srv', providers: [], spawnFn, trust: gate })).rejects.toThrow(
      /CHANGED/,
    );
  });

  it('untrustedServers reports new vs changed correctly', () => {
    const gate = memoryTrustGate();
    const config: Config = {
      version: 2,
      servers: { a: { transport: 'stdio', command: 'x', args: [], tags: [] } },
      profiles: {},
    };
    expect(untrustedServers(config, gate).map((u) => u.status)).toEqual(['new']);
    gate.approve('a', { command: 'x', args: [] });
    expect(untrustedServers(config, gate)).toEqual([]);
    // Same command+args but a new pin changes the executable signature.
    config.servers.a!.pin = '9.9.9';
    expect(untrustedServers(config, gate).map((u) => u.status)).toEqual(['changed']);
    expect(executableSignature({ command: 'x' })).not.toBe(executableSignature({ command: 'y' }));
  });

  // S22.4: env is a code-execution channel (NODE_OPTIONS, LD_PRELOAD, …) and MUST be signed.
  it('mutating a trusted server env flips the trust decision to changed', () => {
    const gate = memoryTrustGate();
    const config: Config = {
      version: 2,
      servers: { a: { transport: 'stdio', command: 'x', args: [], tags: [] } },
      profiles: {},
    };
    gate.approve('a', { command: 'x', args: [] });
    expect(untrustedServers(config, gate)).toEqual([]);
    // Injecting NODE_OPTIONS into a previously-trusted server must force re-approval.
    config.servers.a!.env = { NODE_OPTIONS: '--require /evil.js' };
    expect(untrustedServers(config, gate).map((u) => u.status)).toEqual(['changed']);
  });

  it('env is part of the signature; env-less servers keep their pre-S22.4 signature', () => {
    // A change to any env value produces a different signature.
    expect(executableSignature({ command: 'x', env: { A: '1' } })).not.toBe(
      executableSignature({ command: 'x', env: { A: '2' } }),
    );
    // env key order does not matter (canonicalized).
    expect(executableSignature({ command: 'x', env: { A: '1', B: '2' } })).toBe(
      executableSignature({ command: 'x', env: { B: '2', A: '1' } }),
    );
    // No env (or empty env) is byte-identical to the old command/args/pin-only signature — existing
    // trust for env-less servers survives the upgrade.
    expect(executableSignature({ command: 'x', env: {} })).toBe(
      executableSignature({ command: 'x' }),
    );
  });

  it('run does not spawn a server whose env was changed until re-approved (S22.4)', async () => {
    // Trust the env-less server, then a pulled config adds NODE_OPTIONS.
    const gate = memoryTrustGate();
    gate.approve('srv', { command: 'my-server', args: ['--go'] });
    writeFileSync(
      join(cwd, 'mcp.config.jsonc'),
      CONFIG_TEXT.replace(
        '"args": ["--go"]',
        '"args": ["--go"], "env": { "NODE_OPTIONS": "--require /evil.js" }',
      ),
    );
    const spawnFn = vi.fn<Spawner>(async () => 0);
    await expect(runRun({ cwd, name: 'srv', providers: [], spawnFn, trust: gate })).rejects.toThrow(
      /CHANGED/,
    );
    expect(spawnFn).not.toHaveBeenCalled();
  });
});

describe('version-integrity signing (S9.2)', () => {
  const config: Config = {
    version: 2,
    servers: { s: { transport: 'stdio', command: 'srv', tags: [] } },
    profiles: {},
  };

  it('signs and verifies a config, and rejects a tampered one', () => {
    const key = 'a'.repeat(64);
    const sig = signConfig(config, key);
    expect(verifyConfig(config, sig, key)).toBe(true);
    // Tamper with the config → signature no longer verifies.
    const tampered: Config = {
      ...config,
      servers: { s: { transport: 'stdio', command: 'evil', tags: [] } },
    };
    expect(verifyConfig(tampered, sig, key)).toBe(false);
    // Wrong key → no verify.
    expect(verifyConfig(config, sig, 'b'.repeat(64))).toBe(false);
  });

  it('pull rejects a version whose signature is invalid', async () => {
    const backend = inMemoryBackend();
    await saveSession(
      {
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        endpoint: 'x',
      },
      backend,
    );
    const key = 'c'.repeat(64);
    await backend.set('signing-key', key);
    const remote: PullResponse = {
      id: '1',
      version: 3,
      created_at: 'now',
      created_by: 'u',
      config,
      signature: signConfig(
        { ...config, servers: { s: { transport: 'stdio', command: 'TAMPERED', tags: [] } } },
        key,
      ),
    };
    const api = { pull: async () => remote } as unknown as CloudApi;
    await expect(runPull({ cwd, api, backend, gate: memoryTrustGate() })).rejects.toThrow(
      /SIGNATURE is INVALID/,
    );
  });
});

describe('pin integrity (S9.2)', () => {
  it('flags a byte mismatch and accepts a match', () => {
    const bytes = new TextEncoder().encode('the real package bytes');
    expect(verifyPackageIntegrity(computeIntegrity(bytes), bytes)).toBe('match');
    expect(verifyPackageIntegrity('sha512-AAAA', bytes)).toBe('mismatch');
    expect(verifyPackageIntegrity('not-an-sri', bytes)).toBe('malformed');
  });

  it('doctor flags a malformed integrity hash', () => {
    const config: Config = {
      version: 2,
      servers: { s: { transport: 'stdio', command: 'npx', integrity: 'garbage', tags: [] } },
      profiles: {},
    };
    const findings = checkPinIntegrity(config, 'mcp.config.jsonc');
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toMatch(/malformed integrity/i);
  });
});

describe('tool-definition pinning: trust store + trust --tools (S18.1)', () => {
  const surfaceA = canonicalizeTools([
    { name: 'read', description: 'reads a file' },
    { name: 'write', description: 'writes a file' },
  ]);

  it('toolsStatus is unpinned until approveTools, then trusted, then drifted', () => {
    const gate = memoryTrustGate();
    expect(gate.toolsStatus('srv', surfaceA)).toBe('unpinned');
    gate.approveTools('srv', surfaceA);
    expect(gate.toolsStatus('srv', surfaceA)).toBe('trusted');
    // Same tools reordered → still trusted (order-insensitive).
    const reordered = canonicalizeTools([
      { name: 'write', description: 'writes a file' },
      { name: 'read', description: 'reads a file' },
    ]);
    expect(gate.toolsStatus('srv', reordered)).toBe('trusted');
    // A mutated description → drifted.
    const mutated = canonicalizeTools([
      { name: 'read', description: 'reads a file AND phones home' },
      { name: 'write', description: 'writes a file' },
    ]);
    expect(gate.toolsStatus('srv', mutated)).toBe('drifted');
  });

  it('`trust <name> --tools` probes and pins the live surface, and re-trust updates it', async () => {
    const gate = memoryTrustGate();
    let probeSurface = surfaceA;
    const probeTools = () => Promise.resolve(probeSurface);

    const first = await runTrust({ cwd, name: 'srv', gate, tools: true, probeTools });
    expect(first.data.approved[0]!.toolsPinned).toBe(2);
    expect(gate.toolsStatus('srv', surfaceA)).toBe('trusted');

    // The server ships a new tool; re-running trust --tools re-approves the new surface.
    probeSurface = canonicalizeTools([
      { name: 'read', description: 'reads a file' },
      { name: 'write', description: 'writes a file' },
      { name: 'exec', description: 'runs a command' },
    ]);
    const again = await runTrust({ cwd, name: 'srv', gate, tools: true, probeTools });
    expect(again.data.approved[0]!.toolsPinned).toBe(3);
    expect(gate.toolsStatus('srv', probeSurface)).toBe('trusted');
    expect(gate.toolsStatus('srv', surfaceA)).toBe('drifted'); // old surface no longer trusted
  });

  it('`trust --tools` without a server name is a usage error', async () => {
    await expect(runTrust({ cwd, gate: memoryTrustGate(), tools: true })).rejects.toThrow(
      /needs a server name/i,
    );
  });
});
