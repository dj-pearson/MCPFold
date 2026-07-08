import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PREFERRED_PROTOCOL_VERSION } from '@mcpfold/proxy';
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

/**
 * S16.2 — cross-OS real spawn. Launches an actual stdio server (a tiny node script) through the
 * default (non-mocked) transport, so the spawn goes through resolveCommand on the real platform.
 * On the windows-latest matrix leg this proves a bare command resolves to its .exe and initializes
 * + lists tools without a shell around args; on posix it proves the passthrough is unchanged.
 */
describe('runTest real stdio spawn (S16.2)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mcpfold-real-spawn-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('launches a real node stdio server and lists its tools on this OS', async () => {
    // A minimal newline-delimited JSON-RPC MCP server: answers initialize + tools/list.
    const server = join(dir, 'server.mjs');
    writeFileSync(
      server,
      [
        "let buf = '';",
        "process.stdin.setEncoding('utf8');",
        "process.stdin.on('data', (chunk) => {",
        '  buf += chunk;',
        "  let i = buf.indexOf('\\n');",
        '  while (i !== -1) {',
        '    const line = buf.slice(0, i);',
        '    buf = buf.slice(i + 1);',
        '    if (line.trim()) {',
        '      const msg = JSON.parse(line);',
        '      if (msg.id != null) {',
        '        const result =',
        "          msg.method === 'initialize'",
        "            ? { protocolVersion: '2024-11-05' }",
        "            : msg.method === 'tools/list'",
        "              ? { tools: [{ name: 'ping' }, { name: 'pong' }, { name: 'echo' }] }",
        '              : {};',
        "        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }) + '\\n');",
        '      }',
        '    }',
        "    i = buf.indexOf('\\n');",
        '  }',
        '});',
      ].join('\n'),
    );

    // Use the bare `node` command (resolved on win32 to node.exe by resolveCommand).
    const config = JSON.stringify({
      version: 1,
      servers: { local: { transport: 'stdio', command: 'node', args: [server] } },
      profiles: {},
    });
    writeFileSync(join(dir, 'mcp.config.jsonc'), config);

    const out = await runTest({ cwd: dir, server: 'local', timeoutMs: 8000 });
    expect(out.exit).toBe(EXIT.SUCCESS);
    const r = out.data.results[0]!;
    expect(r.reachable).toBe(true);
    expect(r.toolCount).toBe(3);
    expect(r.protocolVersion).toBe('2024-11-05');
  });
});

/**
 * S17.4 — over real streamable HTTP, the handshake must negotiate a version and echo it as the
 * `MCP-Protocol-Version` header on every request after `initialize` (required since 2025-06-18).
 */
describe('runTest HTTP protocol-version header (S17.4)', () => {
  let dir: string;
  let server: Server;
  let url: string;
  const seen: { method: string; protoHeader: string | undefined }[] = [];

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'mcpfold-http-proto-'));
    seen.length = 0;
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const msg = JSON.parse(body) as JsonRpcMessage;
        seen.push({
          method: msg.method ?? '',
          protoHeader: req.headers['mcp-protocol-version'] as string | undefined,
        });
        // Server counter-offers 2025-06-18 regardless of what we offered.
        const result =
          msg.method === 'initialize'
            ? { protocolVersion: '2025-06-18' }
            : msg.method === 'tools/list'
              ? { tools: [{ name: 'a' }] }
              : {};
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    url = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/mcp`;
  });
  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dir, { recursive: true, force: true });
  });

  it('negotiates the version and sends MCP-Protocol-Version after initialize', async () => {
    writeFileSync(
      join(dir, 'mcp.config.jsonc'),
      JSON.stringify({
        version: 1,
        servers: { remote: { transport: 'http', url } },
        profiles: {},
      }),
    );

    const out = await runTest({ cwd: dir, server: 'remote', timeoutMs: 8000 });
    expect(out.exit).toBe(EXIT.SUCCESS);
    expect(out.data.results[0]!.protocolVersion).toBe('2025-06-18'); // negotiated, not offered

    const initReq = seen.find((s) => s.method === 'initialize');
    const listReq = seen.find((s) => s.method === 'tools/list');
    // The initialize offer carries the newest supported version in its body (not asserted here);
    // the KEY requirement is that the follow-up request echoes the NEGOTIATED version as a header.
    expect(initReq).toBeTruthy();
    expect(listReq?.protoHeader).toBe('2025-06-18');
    expect(PREFERRED_PROTOCOL_VERSION).not.toBe('2025-06-18'); // proves negotiation actually moved it
  });
});
