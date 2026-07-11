import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import type { ToolsDirective } from '@mcpfold/core';
import { connectProxy } from '../src/proxy.js';
import { MemoryTransport } from '../src/transport/memory.js';
import { streamTransport } from '../src/transport/stdio.js';
import { parseMessage, type JsonRpcMessage } from '../src/jsonrpc.js';

describe('connectProxy — transparent passthrough (S5.1)', () => {
  it('forwards initialize/tools/list/tools/call and responses unchanged (no directive)', () => {
    const client = new MemoryTransport();
    const server = new MemoryTransport();
    connectProxy(client, server);

    const init: JsonRpcMessage = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { x: 1 } };
    client.receive(init);
    expect(server.sent[0]).toEqual(init);

    const initResult: JsonRpcMessage = { jsonrpc: '2.0', id: 1, result: { capabilities: {} } };
    server.receive(initResult);
    expect(client.sent[0]).toEqual(initResult);

    // A notification (no id) passes through both ways.
    const note: JsonRpcMessage = { jsonrpc: '2.0', method: 'notifications/initialized' };
    client.receive(note);
    expect(server.sent[1]).toEqual(note);
  });

  it('preserves request ids, errors, and tools/list contents when no directive is set', () => {
    const client = new MemoryTransport();
    const server = new MemoryTransport();
    connectProxy(client, server);

    client.receive({ jsonrpc: '2.0', id: 'abc', method: 'tools/list' });
    const listResult: JsonRpcMessage = {
      jsonrpc: '2.0',
      id: 'abc',
      result: { tools: [{ name: 'a' }, { name: 'b' }] },
    };
    server.receive(listResult);
    expect(client.sent[0]).toEqual(listResult); // untouched

    const err: JsonRpcMessage = { jsonrpc: '2.0', id: 2, error: { code: -32000, message: 'boom' } };
    server.receive(err);
    expect(client.sent[1]).toEqual(err);
  });
});

describe('connectProxy — tool filter cannot be bypassed (S22.12)', () => {
  const deny: ToolsDirective = { mode: 'deny', list: ['blocked'] };

  it('drops a NOTIFICATION-form call (no id) to a denied tool instead of forwarding it', () => {
    const client = new MemoryTransport();
    const server = new MemoryTransport();
    connectProxy(client, server, { tools: deny });
    // A tools/call sent as a notification (no id) must NOT reach the server.
    client.receive({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'blocked' } });
    expect(server.sent).toHaveLength(0);
  });

  it('rejects a request-form call to a denied tool with an error, not forwarding it', () => {
    const client = new MemoryTransport();
    const server = new MemoryTransport();
    connectProxy(client, server, { tools: deny });
    client.receive({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'blocked' } });
    expect(server.sent).toHaveLength(0);
    expect(client.sent[0]?.error?.message).toMatch(/not available/);
  });

  it('blocks a case/whitespace variant of a denied tool name', () => {
    const client = new MemoryTransport();
    const server = new MemoryTransport();
    connectProxy(client, server, { tools: deny });
    client.receive({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: '  BLOCKED ' } });
    expect(server.sent).toHaveLength(0);
    expect(client.sent[0]?.error).toBeDefined();
  });

  it('still forwards an allowed tool call in both request and notification form', () => {
    const client = new MemoryTransport();
    const server = new MemoryTransport();
    connectProxy(client, server, { tools: deny });
    client.receive({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'ok' } });
    client.receive({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'ok' } });
    expect(server.sent).toHaveLength(2);
  });

  // S22.13: a tracked tools/list id that comes back as an error (not a tools result) must be evicted
  // and the error forwarded unchanged — it must not leak in the pending map.
  it('forwards an error response to a tracked tools/list unchanged (no pending-map leak)', () => {
    const client = new MemoryTransport();
    const server = new MemoryTransport();
    connectProxy(client, server, { tools: deny });
    client.receive({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const err: JsonRpcMessage = { jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'nope' } };
    server.receive(err);
    expect(client.sent[0]).toEqual(err); // forwarded verbatim, id evicted
  });
});

describe('streamTransport framing (S5.1)', () => {
  it('parses newline-delimited JSON and writes framed messages', () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const t = streamTransport(input, output);

    const received: JsonRpcMessage[] = [];
    t.onMessage((m) => received.push(m));

    // Two messages arriving across chunk boundaries.
    input.write('{"jsonrpc":"2.0","id":1,"met');
    input.write('hod":"ping"}\n{"jsonrpc":"2.0","id":2,"method":"pong"}\n');
    expect(received.map((m) => m.method)).toEqual(['ping', 'pong']);

    t.send({ jsonrpc: '2.0', id: 3, method: 'x' });
    const written = output.read() as Buffer;
    expect(parseMessage(written.toString('utf8'))).toEqual({ jsonrpc: '2.0', id: 3, method: 'x' });
  });
});
