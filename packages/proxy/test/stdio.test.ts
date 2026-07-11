import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { streamTransport } from '../src/transport/stdio.js';
import { connectProxy } from '../src/proxy.js';
import type { JsonRpcMessage } from '../src/jsonrpc.js';

/**
 * Containment of an untrusted server over stdio (S22.10): the read buffer is capped, stream
 * errors/EOF are surfaced cleanly, and close() destroys the stream.
 */
describe('streamTransport containment (S22.10)', () => {
  it('force-closes with an error when one line exceeds the cap, bounding memory', () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const t = streamTransport(input, output, { maxLineBytes: 100 });

    let closeError: Error | undefined;
    let closed = false;
    t.onClose?.((err) => {
      closed = true;
      closeError = err;
    });

    // A flood with no newline must not grow the buffer without bound — it trips the cap and closes.
    input.write('x'.repeat(500));
    expect(closed).toBe(true);
    expect(closeError?.message).toMatch(/line cap/);
    // The stream is destroyed, so no more bytes can accumulate.
    expect(input.destroyed).toBe(true);
  });

  it('surfaces a stream error via onClose instead of throwing (EPIPE on a dead child)', () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const t = streamTransport(input, output);

    let closeError: Error | undefined;
    t.onClose?.((err) => {
      closeError = err;
    });
    // An uncaught 'error' would crash the proxy; the transport must catch and surface it.
    expect(() => input.emit('error', new Error('EPIPE'))).not.toThrow();
    expect(closeError?.message).toBe('EPIPE');
  });

  it('close() removes all listeners and destroys the input stream', () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const t = streamTransport(input, output);
    t.close();
    expect(input.destroyed).toBe(true);
    expect(input.listenerCount('data')).toBe(0);
    expect(input.listenerCount('error')).toBe(0);
  });

  it('delivers a final newline-less message on clean EOF (no silent drop)', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const t = streamTransport(input, output);
    const received: JsonRpcMessage[] = [];
    t.onMessage((m) => received.push(m));

    input.write('{"jsonrpc":"2.0","id":9,"method":"tail"}'); // no trailing newline
    input.end();
    await new Promise((r) => setImmediate(r)); // 'end' fires on a later tick
    expect(received.map((m) => m.method)).toEqual(['tail']);
  });

  it('a clean EOF surfaces via onClose with no error', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const t = streamTransport(input, output);
    let calls = 0;
    let sawError = false;
    t.onClose?.((err) => {
      calls++;
      if (err) sawError = true;
    });
    input.end();
    await new Promise((r) => setImmediate(r));
    expect(calls).toBe(1);
    expect(sawError).toBe(false);
  });
});

describe('connectProxy session teardown (S22.10)', () => {
  it('a server-side stream error tears down BOTH sides of the session', () => {
    const clientIn = new PassThrough();
    const client = streamTransport(clientIn, new PassThrough());
    const serverIn = new PassThrough();
    const server = streamTransport(serverIn, new PassThrough());

    connectProxy(client, server);
    // The untrusted server crashes mid-session.
    serverIn.emit('error', new Error('server crashed'));

    expect(serverIn.destroyed).toBe(true);
    // The proxy disposed the whole session, so the client side's stream was destroyed too.
    expect(clientIn.destroyed).toBe(true);
  });
});
