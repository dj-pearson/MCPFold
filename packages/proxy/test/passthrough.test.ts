import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
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
