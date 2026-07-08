import type { Readable, Writable } from 'node:stream';
import { parseMessage, serializeMessage, type JsonRpcMessage } from '../jsonrpc.js';
import type { MessageTransport } from './types.js';

/**
 * Stdio transport: reads newline-delimited JSON-RPC messages from a Readable and writes them
 * to a Writable. Used to bridge the parent process stdio (the MCP client) and a spawned
 * server child's stdio.
 */
export function streamTransport(input: Readable, output: Writable): MessageTransport {
  let handler: ((message: JsonRpcMessage) => void) | undefined;
  let buffer = '';

  const onData = (chunk: Buffer | string): void => {
    buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      const message = parseMessage(line);
      if (message && handler) handler(message);
      newlineIndex = buffer.indexOf('\n');
    }
  };

  input.setEncoding('utf8');
  input.on('data', onData);

  return {
    onMessage(h) {
      handler = h;
    },
    send(message) {
      output.write(serializeMessage(message));
    },
    close() {
      input.off('data', onData);
    },
  };
}
