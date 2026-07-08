/**
 * Minimal JSON-RPC 2.0 message model + newline-delimited framing (MCP stdio transport).
 * The proxy is transport-agnostic: it operates on {@link JsonRpcMessage} objects and lets
 * transports handle framing.
 */

export type JsonRpcId = string | number | null;

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: JsonRpcError;
}

/** Parse one newline-delimited JSON message; returns null on malformed input. */
export function parseMessage(line: string): JsonRpcMessage | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as JsonRpcMessage;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/** Serialize a message with a trailing newline (MCP stdio framing). */
export function serializeMessage(message: JsonRpcMessage): string {
  return `${JSON.stringify(message)}\n`;
}

/** True if the message is a request carrying the given method. */
export function isRequest(message: JsonRpcMessage, method?: string): boolean {
  if (typeof message.method !== 'string') return false;
  return method === undefined ? true : message.method === method;
}

/** True if the message is a response (has result or error) to a request id. */
export function isResponse(message: JsonRpcMessage): boolean {
  return message.id !== undefined && (message.result !== undefined || message.error !== undefined);
}

/** Build a JSON-RPC error response for a request id. */
export function errorResponse(id: JsonRpcId, error: JsonRpcError): JsonRpcMessage {
  return { jsonrpc: '2.0', id, error };
}
