import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { JsonRpcId, JsonRpcMessage, MessageTransport } from '@mcpfold/proxy';
import { estimateToolTokens } from '@mcpfold/core';
import { runInspect } from '../src/commands/inspect.js';
import { buildCurateData } from '../src/commands/curate.js';
import {
  cachedToolNames,
  readSnapshot,
  writeSnapshot,
  type SurfaceSnapshot,
} from '../src/discover/cache.js';

/**
 * Live tool-surface discovery (S24.6). Uses a mock transport so the "live" handshake is deterministic
 * and offline; the cache is redirected to a temp dir so no real user state is touched.
 */

const SECRET = 'supersecret-token-abc123456';

const CONFIG = `{
  "version": 1,
  "servers": {
    "gh": { "transport": "stdio", "command": "gh-mcp", "args": ["serve"], "env": { "TOKEN": "\${env:GH_TOKEN}" }, "tags": ["code"] }
  },
  "profiles": { "cursor-user": { "client": "cursor", "scope": "user", "include": ["code"] } }
}`;

const TOOLS = [
  { name: 'search_code', description: 'search the codebase', inputSchema: { type: 'object' } },
  { name: 'create_pr', description: 'open a pull request', inputSchema: { type: 'object' } },
  { name: 'delete_repo', description: 'DANGER', inputSchema: { type: 'object' } },
];

/** A mock MCP server transport that completes the handshake and lists TOOLS. */
function mockServer(): MessageTransport {
  let onMsg: ((m: JsonRpcMessage) => void) | undefined;
  const reply = (method: string, id: JsonRpcId): JsonRpcMessage | null => {
    if (method === 'initialize') return { jsonrpc: '2.0', id, result: { protocolVersion: '2025-06-18' } };
    if (method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
    return null;
  };
  return {
    onMessage: (h) => {
      onMsg = h;
    },
    send: (msg) => {
      if (msg.id == null) return;
      const r = reply(msg.method ?? '', msg.id);
      if (r) queueMicrotask(() => onMsg?.(r));
    },
    close: () => {},
  };
}

let cwd: string;
let cacheDir: string;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'mcpfold-discover-'));
  cacheDir = mkdtempSync(join(tmpdir(), 'mcpfold-discover-cache-'));
  writeFileSync(join(cwd, 'mcp.config.jsonc'), CONFIG);
  process.env.GH_TOKEN = SECRET;
});
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
  rmSync(cacheDir, { recursive: true, force: true });
  delete process.env.GH_TOKEN;
});

describe('discovery cache (S24.6)', () => {
  it('round-trips a snapshot and exposes its tool names', () => {
    const snap: SurfaceSnapshot = {
      server: 'gh',
      capturedAt: '2026-07-13T00:00:00.000Z',
      transport: 'stdio',
      toolCount: 2,
      totalTokens: 42,
      tools: [
        { name: 'a', tokens: 20 },
        { name: 'b', tokens: 22 },
      ],
    };
    writeSnapshot(snap, { dir: cacheDir });
    expect(readSnapshot('gh', { dir: cacheDir })).toEqual(snap);
    expect(cachedToolNames('gh', { dir: cacheDir })).toEqual(['a', 'b']);
    expect(cachedToolNames('missing', { dir: cacheDir })).toBeNull();
  });
});

describe('runInspect (S24.6)', () => {
  it('captures the exact tool surface with stable token estimates and writes the cache', async () => {
    const out = await runInspect({
      cwd,
      server: 'gh',
      transportFactory: () => mockServer(),
      timeoutMs: 500,
      now: () => new Date('2026-07-13T00:00:00.000Z'),
      cache: { dir: cacheDir },
    });
    expect(out.exit).toBe(0);
    const snap = out.data.results[0]!.snapshot!;
    // Exact names, sorted; each token estimate matches the benchmark method on the tool's JSON.
    expect(snap.tools.map((t) => t.name)).toEqual(['create_pr', 'delete_repo', 'search_code']);
    expect(snap.toolCount).toBe(3);
    const expectedFor = (name: string) =>
      estimateToolTokens(TOOLS.find((t) => t.name === name));
    expect(snap.tools.find((t) => t.name === 'search_code')!.tokens).toBe(expectedFor('search_code'));
    expect(snap.totalTokens).toBe(TOOLS.reduce((s, t) => s + estimateToolTokens(t), 0));
    // The snapshot was persisted to the (temp) cache.
    expect(cachedToolNames('gh', { dir: cacheDir })).toEqual([
      'create_pr',
      'delete_repo',
      'search_code',
    ]);
  });

  it('never writes a resolved secret value into the cache (ref-only invariant)', async () => {
    await runInspect({
      cwd,
      server: 'gh',
      transportFactory: () => mockServer(),
      timeoutMs: 500,
      cache: { dir: cacheDir },
    });
    const raw = readFileSync(join(cacheDir, 'gh.json'), 'utf8');
    expect(raw).not.toContain(SECRET);
    expect(raw).not.toContain('GH_TOKEN'); // no env at all — names + token counts only
  });

  it('reports a coded failure (nonzero) when the server never handshakes', async () => {
    const dead: MessageTransport = { onMessage: () => {}, send: () => {}, close: () => {} };
    const out = await runInspect({
      cwd,
      server: 'gh',
      transportFactory: () => dead,
      timeoutMs: 200,
      cache: { dir: cacheDir },
    });
    expect(out.exit).not.toBe(0);
    expect(out.data.results[0]!.ok).toBe(false);
    expect(out.data.results[0]!.error).toContain('discover the tool surface');
  });
});

describe('curate uses discovery snapshots for deny/no-directive servers (S24.6 → curate)', () => {
  it('reports allowed-but-unused tools for a no-directive server from the cached surface', () => {
    // gh has NO tools directive; usage shows only search_code was ever called.
    const logPath = join(cwd, 'audit.jsonl');
    writeFileSync(
      logPath,
      JSON.stringify({
        ts: '2026-07-11T00:00:00.000Z',
        server: 'gh',
        type: 'tools/call',
        tool: 'search_code',
        outcome: 'ok',
      }),
    );
    // A discovery snapshot naming the full 3-tool surface.
    writeSnapshot(
      {
        server: 'gh',
        capturedAt: '2026-07-13T00:00:00.000Z',
        transport: 'stdio',
        toolCount: 3,
        totalTokens: 100,
        tools: TOOLS.map((t) => ({ name: t.name, tokens: estimateToolTokens(t) })),
      },
      { dir: cacheDir },
    );

    const data = buildCurateData({ cwd, auditLogPath: logPath, cache: { dir: cacheDir } });
    const gh = data.servers.find((s) => s.server === 'gh')!;
    // Without the snapshot, a no-directive server could report no "unused" set; with it, the two
    // never-used tools are surfaced as trimmable.
    expect(gh.recommended.list).toEqual(['search_code']);
    expect(gh.unusedAllowed.sort()).toEqual(['create_pr', 'delete_repo']);
  });
});
