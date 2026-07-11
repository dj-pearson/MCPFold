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
  /**
   * Optional (S22.10): register a handler invoked once when the underlying stream ends, errors, or
   * is force-closed (e.g. the server child crashed, or flooded past the line cap). The proxy wires
   * this to tear the whole session down cleanly instead of leaking a half-open pipe or crashing on
   * an unhandled stream error. `error` is set for an abnormal close, undefined for a clean EOF.
   */
  onClose?(handler: (error?: Error) => void): void;
  /**
   * Optional (S17.4): called once with the negotiated MCP protocol version after `initialize`
   * completes. HTTP transports must echo it as the `MCP-Protocol-Version` header on every
   * subsequent request (required since protocol 2025-06-18). No-op for stdio/in-memory.
   */
  setProtocolVersion?(version: string): void;
}
