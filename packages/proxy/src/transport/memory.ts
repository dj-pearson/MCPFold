import type { JsonRpcMessage } from '../jsonrpc.js';
import type { MessageTransport } from './types.js';

/**
 * In-memory transport for tests: `receive()` simulates a message arriving from the peer, and
 * `sent` records everything the proxy wrote toward the peer.
 */
export class MemoryTransport implements MessageTransport {
  readonly sent: JsonRpcMessage[] = [];
  private handler?: (message: JsonRpcMessage) => void;
  closed = false;

  onMessage(handler: (message: JsonRpcMessage) => void): void {
    this.handler = handler;
  }

  send(message: JsonRpcMessage): void {
    this.sent.push(message);
  }

  /** Simulate a message arriving from the peer (drives the proxy). */
  receive(message: JsonRpcMessage): void {
    this.handler?.(message);
  }

  close(): void {
    this.closed = true;
  }
}
