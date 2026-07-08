import { isResponse, type JsonRpcId, type JsonRpcMessage } from './jsonrpc.js';
import type { MessageTransport } from './transport/types.js';

/**
 * MCP initialize + tools/list handshake (S10.4) over any {@link MessageTransport}. Transport-
 * agnostic — the CLI `test` command drives it over a spawned stdio process or an HTTP transport,
 * and tests drive it over an in-memory mock. Confirms a server actually initializes and can list
 * its tools, with a bounded per-request timeout so a hung server aborts cleanly (S0.9).
 */

export const MCP_PROTOCOL_VERSION = '2024-11-05';

export interface HandshakeResult {
  reachable: boolean;
  protocolVersion?: string;
  toolCount?: number;
  /** Present when unreachable — a message safe to print (never the resolved token). */
  error?: string;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

export async function handshake(
  transport: MessageTransport,
  opts: { timeoutMs?: number; clientName?: string } = {},
): Promise<HandshakeResult> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const pending = new Map<JsonRpcId, Pending>();

  transport.onMessage((msg: JsonRpcMessage) => {
    if (!isResponse(msg) || msg.id == null) return;
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.error.message));
    else p.resolve(msg.result);
  });

  let nextId = 0;
  const request = (method: string, params: unknown): Promise<unknown> => {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`no response within ${timeoutMs}ms`));
      }, timeoutMs);
      pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      transport.send({ jsonrpc: '2.0', id, method, params });
    });
  };

  try {
    const init = (await request('initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: opts.clientName ?? 'mcpfold', version: '1' },
    })) as { protocolVersion?: string } | null;

    // MCP requires the client to confirm initialization before other requests.
    transport.send({ jsonrpc: '2.0', method: 'notifications/initialized' });

    const tools = (await request('tools/list', {})) as { tools?: unknown[] } | null;
    return {
      reachable: true,
      protocolVersion: init?.protocolVersion,
      toolCount: Array.isArray(tools?.tools) ? tools!.tools!.length : 0,
    };
  } catch (err) {
    return { reachable: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    transport.close();
  }
}
