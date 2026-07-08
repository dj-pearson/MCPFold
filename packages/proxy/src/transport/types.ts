import type { JsonRpcMessage } from '../jsonrpc.js';

/**
 * A bidirectional MCP message transport. The proxy wires two of these together (client-side
 * and server-side). Concrete transports (stdio streams, in-memory test) implement it.
 */
export interface MessageTransport {
  /** Register the handler for messages arriving from the peer. Called once. */
  onMessage(handler: (message: JsonRpcMessage) => void): void;
  /** Send a message to the peer. */
  send(message: JsonRpcMessage): void;
  /** Close the transport and release resources. */
  close(): void;
}
