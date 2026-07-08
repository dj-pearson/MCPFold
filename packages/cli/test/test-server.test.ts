import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { JsonRpcId, JsonRpcMessage, MessageTransport } from '@mcpfold/proxy';
import { runTest } from '../src/commands/test.js';
import { EXIT } from '../src/output/exit-codes.js';

const TOKEN = 'supersecret-token-abc123456';
const CONFIG = `{
  "version": 1,
  "servers": {
    "gh": { "transport": "http", "url": "https://example.test/mcp", "auth": { "token": "\${env:TEST_TOKEN}" } }
  },
  "profiles": {}
}`;

/** A mock MCP server transport: `respond` produces the reply for each request (or null to hang). */
function mock(respond: (method: string, id: JsonRpcId) => JsonRpcMessage | null): MessageTransport {
  let onMsg: ((m: JsonRpcMessage) => void) | undefined;
  return {
    onMessage: (h) => {
      onMsg = h;
    },
    send: (msg) => {
      if (msg.id == null) return; // notification
      const reply = respond(msg.method ?? '', msg.id);
      if (reply) queueMicrotask(() => onMsg?.(reply));
    },
    close: () => {},
  };
}

let cwd: string;
beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'mcpfold-test-cmd-'));
  writeFileSync(join(cwd, 'mcp.config.jsonc'), CONFIG);
  process.env.TEST_TOKEN = TOKEN;
});
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
  delete process.env.TEST_TOKEN;
});

describe('runTest (S10.4)', () => {
  it('a healthy server reports its tool count and protocol', async () => {
    const healthy = mock((method, id) => {
      if (method === 'initialize')
        return { jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05' } };
      if (method === 'tools/list')
        return { jsonrpc: '2.0', id, result: { tools: [{ name: 'a' }, { name: 'b' }] } };
      return null;
    });
    const out = await runTest({
      cwd,
      server: 'gh',
      transportFactory: () => healthy,
      timeoutMs: 500,
    });
    expect(out.exit).toBe(EXIT.SUCCESS);
    const r = out.data.results[0]!;
    expect(r.reachable).toBe(true);
    expect(r.toolCount).toBe(2);
    expect(r.protocolVersion).toBe('2024-11-05');
  });

  it('an unreachable server is reported with a nonzero exit', async () => {
    const dead = mock((_m, id) => ({
      jsonrpc: '2.0',
      id,
      error: { code: -1, message: 'connection refused' },
    }));
    const out = await runTest({ cwd, server: 'gh', transportFactory: () => dead, timeoutMs: 500 });
    expect(out.exit).toBe(EXIT.DIFF);
    expect(out.data.results[0]!.reachable).toBe(false);
    expect(out.data.results[0]!.error).toContain('connection refused');
  });

  it('an auth failure never echoes the resolved token', async () => {
    // A leaky server that puts the token in its error message — we must scrub it.
    const leaky = mock((_m, id) => ({
      jsonrpc: '2.0',
      id,
      error: { code: 401, message: `unauthorized: token ${TOKEN} rejected` },
    }));
    const out = await runTest({ cwd, server: 'gh', transportFactory: () => leaky, timeoutMs: 500 });
    expect(out.data.results[0]!.reachable).toBe(false);
    expect(out.data.results[0]!.error).not.toContain(TOKEN);
    expect(out.data.results[0]!.error).toContain('unauthorized');
  });

  it('a hung server aborts on the bounded timeout', async () => {
    const hung = mock(() => null); // never responds
    const out = await runTest({ cwd, server: 'gh', transportFactory: () => hung, timeoutMs: 80 });
    expect(out.data.results[0]!.reachable).toBe(false);
    expect(out.data.results[0]!.error).toMatch(/no response within 80ms/);
  });
});
