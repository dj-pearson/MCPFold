import type { Readable, Writable } from 'node:stream';
import { parseMessage, serializeMessage, type JsonRpcMessage } from '../jsonrpc.js';
import type { MessageTransport } from './types.js';

/**
 * Stdio transport: reads newline-delimited JSON-RPC messages from a Readable and writes them
 * to a Writable. Used to bridge the parent process stdio (the MCP client) and a spawned
 * server child's stdio.
 *
 * Containment (S22.10): the server is the untrusted party the curation proxy exists to contain, so
 * a single unterminated line is capped (a flood past the cap force-closes the connection instead of
 * growing unbounded toward OOM), and `error`/`end`/`close` on either stream are surfaced through
 * `onClose` so a crashing server (EPIPE mid-write) tears the session down cleanly rather than raising
 * an uncaught exception.
 */

/** Default cap on ONE unterminated line before the connection is force-closed (8 MiB). */
const DEFAULT_MAX_LINE_BYTES = 8 * 1024 * 1024;

export interface StreamTransportOptions {
  /**
   * Max length (bytes; ~chars for ASCII JSON-RPC) buffered for a single line that has not yet been
   * terminated by a newline, before the transport closes with an error. Bounds proxy memory against
   * a server that streams without ever emitting `\n`. Default 8 MiB.
   */
  maxLineBytes?: number;
}

export function streamTransport(
  input: Readable,
  output: Writable,
  options: StreamTransportOptions = {},
): MessageTransport {
  const maxLineBytes = options.maxLineBytes ?? DEFAULT_MAX_LINE_BYTES;
  let handler: ((message: JsonRpcMessage) => void) | undefined;
  let closeHandler: ((error?: Error) => void) | undefined;
  let buffer = '';
  let closed = false;

  const drain = (): void => {
    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      const message = parseMessage(line);
      if (message && handler) handler(message);
      newlineIndex = buffer.indexOf('\n');
    }
  };

  const cleanup = (): void => {
    input.off('data', onData);
    input.off('error', onError);
    input.off('end', onEnd);
    input.off('close', onEnd);
    output.off('error', onOutputError);
  };

  /** Tear down exactly once; `error` distinguishes an abnormal close from a clean EOF. */
  const finish = (error?: Error): void => {
    if (closed) return;
    closed = true;
    buffer = '';
    cleanup();
    input.destroy?.();
    closeHandler?.(error);
  };

  const onData = (chunk: Buffer | string): void => {
    if (closed) return;
    buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    drain();
    // After draining every complete line, whatever remains is one unterminated line. Cap it so a
    // newline-less flood can't grow the buffer without bound.
    if (buffer.length > maxLineBytes) {
      finish(
        new Error(
          `stdio message exceeded the ${maxLineBytes}-byte line cap without a newline — closing the connection`,
        ),
      );
    }
  };

  const onError = (error: Error): void => finish(error);
  const onOutputError = (error: Error): void => finish(error);

  const onEnd = (): void => {
    // Deliver a final newline-less message the peer sent right before EOF (previously dropped).
    if (buffer.length > 0 && buffer.length <= maxLineBytes) {
      const message = parseMessage(buffer);
      if (message && handler) handler(message);
    }
    finish();
  };

  input.setEncoding('utf8');
  input.on('data', onData);
  input.on('error', onError);
  input.on('end', onEnd);
  input.on('close', onEnd);
  output.on('error', onOutputError);

  return {
    onMessage(h) {
      handler = h;
    },
    onClose(h) {
      closeHandler = h;
    },
    send(message) {
      if (closed) return;
      try {
        output.write(serializeMessage(message));
      } catch (error) {
        // A synchronous write failure (e.g. the child's stdin already gone) shuts the session down
        // instead of throwing out of send().
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    },
    close() {
      finish();
    },
  };
}
