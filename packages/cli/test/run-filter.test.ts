import { PassThrough } from 'node:stream';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectProxy, streamTransport, type JsonRpcMessage } from '@mcpfold/proxy';
import { runRun, shouldUseProxy, type ProxySpawner, type Spawner } from '../src/commands/run.js';
import type { TrustGate } from '../src/trust/tofu.js';

const trustAll: TrustGate = {
  status: () => 'trusted',
  isTrusted: () => true,
  approve: () => {},
  trustedTools: () => undefined,
  toolsStatus: () => 'unpinned',
  approveTools: () => {},
};

let cwd: string;

const CONFIG = `{
  "version": 1,
  "servers": {
    "curated": { "transport": "stdio", "command": "srv", "args": ["--x"], "tools": { "mode": "allow", "list": ["read", "search"] }, "tags": ["t"] },
    "plain": { "transport": "stdio", "command": "srv2", "tags": ["t"] }
  },
  "profiles": { "c": { "client": "cursor", "scope": "user", "include": ["t"] } }
}`;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'mcpfold-runf-'));
  writeFileSync(join(cwd, 'mcp.config.jsonc'), CONFIG);
});
afterEach(() => rmSync(cwd, { recursive: true, force: true }));

describe('shouldUseProxy (S5.3)', () => {
  it('is true only for a stdio server with a tools directive', () => {
    expect(shouldUseProxy({ transport: 'stdio', tools: { mode: 'allow', list: [] } })).toBe(true);
    expect(shouldUseProxy({ transport: 'stdio' })).toBe(false);
    expect(shouldUseProxy({ transport: 'http', tools: { mode: 'allow', list: [] } })).toBe(false);
  });
});

describe('runRun routing (S5.3)', () => {
  it('routes a server with a tools directive through the proxy spawner', async () => {
    const proxySpawnFn = vi.fn<ProxySpawner>(async (_c, _a, _e, tools) => {
      expect(tools).toEqual({ mode: 'allow', list: ['read', 'search'] });
      return 0;
    });
    const spawnFn = vi.fn<Spawner>(async () => 0);
    await runRun({ cwd, name: 'curated', providers: [], spawnFn, proxySpawnFn, trust: trustAll });
    expect(proxySpawnFn).toHaveBeenCalledTimes(1);
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it('routes a server WITHOUT a directive through the plain spawner (no proxy overhead)', async () => {
    const proxySpawnFn = vi.fn<ProxySpawner>(async () => 0);
    const spawnFn = vi.fn<Spawner>(async () => 0);
    await runRun({ cwd, name: 'plain', providers: [], spawnFn, proxySpawnFn, trust: trustAll });
    expect(spawnFn).toHaveBeenCalledTimes(1);
    expect(proxySpawnFn).not.toHaveBeenCalled();
  });

  // S18.1: a pinned tool surface routes even a directive-less server through the proxy so drift
  // can be verified live, and passes the pinned surface + the strict/warn mode down.
  it('routes a pinned-but-directive-less server through the proxy with its pinned surface', async () => {
    const pinnedGate: TrustGate = {
      ...trustAll,
      trustedTools: () => ({
        digest: 'd',
        surface: [{ name: 'read', description: 'r', schemaDigest: '' }],
      }),
    };
    let pinnedArg: unknown;
    const proxySpawnFn = vi.fn<ProxySpawner>(async (_c, _a, _e, _tools, pinned) => {
      pinnedArg = pinned;
      return 0;
    });
    const spawnFn = vi.fn<Spawner>(async () => 0);
    await runRun({
      cwd,
      name: 'plain', // no tools directive
      providers: [],
      spawnFn,
      proxySpawnFn,
      trust: pinnedGate,
      strictTools: true,
    });
    expect(proxySpawnFn).toHaveBeenCalledTimes(1);
    expect(spawnFn).not.toHaveBeenCalled();
    expect((pinnedArg as { mode: string }).mode).toBe('block'); // strictTools → block
    expect((pinnedArg as { surface: unknown[] }).surface).toHaveLength(1);
  });
});

describe('end-to-end: a client launching the shim sees only the allowed tools (S5.3)', () => {
  it('filters tools/list across the real stream transports', async () => {
    // Simulate the four pipes the proxy spawner wires: client<->us and us<->child.
    const clientToUs = new PassThrough();
    const usToClient = new PassThrough();
    const childToUs = new PassThrough();
    const usToChild = new PassThrough();

    const clientTransport = streamTransport(clientToUs, usToClient);
    const serverTransport = streamTransport(childToUs, usToChild);
    connectProxy(clientTransport, serverTransport, {
      tools: { mode: 'allow', list: ['read', 'search'] },
    });

    // A fake server: when it receives a tools/list on usToChild, reply with 20 tools.
    const twenty = Array.from({ length: 20 }, (_, i) => ({
      name: i < 2 ? ['read', 'search'][i] : `t${i}`,
    }));
    usToChild.setEncoding('utf8');
    usToChild.on('data', (line: string) => {
      const req = JSON.parse(line.trim()) as JsonRpcMessage;
      if (req.method === 'tools/list') {
        childToUs.write(
          `${JSON.stringify({ jsonrpc: '2.0', id: req.id, result: { tools: twenty } })}\n`,
        );
      }
    });

    // Capture what reaches the client.
    const clientReceived: JsonRpcMessage[] = [];
    usToClient.setEncoding('utf8');
    usToClient.on('data', (line: string) =>
      clientReceived.push(JSON.parse(line.trim()) as JsonRpcMessage),
    );

    // Client asks for the tool list.
    clientToUs.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })}\n`);
    await new Promise((r) => setImmediate(r));

    const tools = (clientReceived[0]?.result as { tools: { name: string }[] }).tools;
    expect(tools.map((t) => t.name)).toEqual(['read', 'search']); // 20 → 2
  });
});
