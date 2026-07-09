import { describe, expect, it } from 'vitest';
import type { ToolsDirective } from '@mcpfold/core';
import { connectProxy, DISCOVER_METHOD } from '../src/proxy.js';
import {
  handshake,
  META_PROTOCOL_VERSION_KEY,
  PREFERRED_PROTOCOL_VERSION,
} from '../src/handshake.js';
import { MemoryTransport } from '../src/transport/memory.js';
import type { JsonRpcId, JsonRpcMessage } from '../src/jsonrpc.js';
import type { MessageTransport } from '../src/transport/types.js';

/**
 * S17.6 — the proxy and handshake must work on both sides of the 2026-07-28 stateless-core
 * transition: curation applies to `server/discover` exactly as to `tools/list`, `_meta` and MRTR
 * flows pass through untouched, and the handshake can probe via discover when initialize is absent.
 */

const tools = [
  { name: 'read', description: 'r' },
  { name: 'write', description: 'w' },
  { name: 'delete', description: 'd' },
];
const allowReadWrite: ToolsDirective = { mode: 'allow', list: ['read', 'write'] };

describe('proxy dual-mode filtering (S17.6)', () => {
  it('filters server/discover responses identically to tools/list', () => {
    // Session mode: tools/list.
    const c1 = new MemoryTransport();
    const s1 = new MemoryTransport();
    connectProxy(c1, s1, { tools: allowReadWrite });
    c1.receive({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    s1.receive({ jsonrpc: '2.0', id: 1, result: { tools } });
    const sessionTools = (c1.sent[0]?.result as { tools: { name: string }[] }).tools;

    // Stateless mode: server/discover, same server, same directive.
    const c2 = new MemoryTransport();
    const s2 = new MemoryTransport();
    connectProxy(c2, s2, { tools: allowReadWrite });
    c2.receive({ jsonrpc: '2.0', id: 1, method: DISCOVER_METHOD });
    s2.receive({ jsonrpc: '2.0', id: 1, result: { tools } });
    const statelessTools = (c2.sent[0]?.result as { tools: { name: string }[] }).tools;

    // Identical curation outcome across modes.
    expect(sessionTools.map((t) => t.name)).toEqual(['read', 'write']);
    expect(statelessTools.map((t) => t.name)).toEqual(['read', 'write']);
    expect(statelessTools).toEqual(sessionTools);
  });

  it('preserves _meta and sibling fields on a curated discover response', () => {
    const client = new MemoryTransport();
    const server = new MemoryTransport();
    connectProxy(client, server, { tools: allowReadWrite });
    client.receive({ jsonrpc: '2.0', id: 7, method: DISCOVER_METHOD });
    server.receive({
      jsonrpc: '2.0',
      id: 7,
      result: {
        tools,
        capabilities: { prompts: {} },
        _meta: { [META_PROTOCOL_VERSION_KEY]: '2026-07-28' },
      },
    });
    const result = client.sent[0]?.result as {
      tools: unknown[];
      capabilities: unknown;
      _meta: Record<string, unknown>;
    };
    expect(result.tools).toHaveLength(2); // curated
    expect(result.capabilities).toEqual({ prompts: {} }); // untouched
    expect(result._meta[META_PROTOCOL_VERSION_KEY]).toBe('2026-07-28'); // _meta intact
  });

  it('rejects a filtered tools/call in stateless mode (params.name shape unchanged)', () => {
    const client = new MemoryTransport();
    const server = new MemoryTransport();
    connectProxy(client, server, { tools: allowReadWrite });
    // A tools/call carrying _meta (stateless version) to a denied tool.
    client.receive({
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: { name: 'delete', _meta: { [META_PROTOCOL_VERSION_KEY]: '2026-07-28' } },
    });
    expect(server.sent).toHaveLength(0); // never forwarded
    expect((client.sent[0]?.error as { message: string }).message).toContain('not available');
  });

  it('passes an MRTR input_required result and its retry through unharmed', () => {
    const client = new MemoryTransport();
    const server = new MemoryTransport();
    connectProxy(client, server, { tools: allowReadWrite });

    // Allowed call → forwarded verbatim.
    const call: JsonRpcMessage = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'write', arguments: { path: '/x' } },
    };
    client.receive(call);
    expect(server.sent[0]).toEqual(call);

    // Server responds with an MRTR input_required result → forwarded untouched.
    const mrtr: JsonRpcMessage = {
      jsonrpc: '2.0',
      id: 1,
      result: { resultType: 'input_required', inputRequests: [{ name: 'confirm' }] },
    };
    server.receive(mrtr);
    expect(client.sent[0]).toEqual(mrtr);

    // Client retries with inputResponses → forwarded untouched (still an allowed tool).
    const retry: JsonRpcMessage = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'write', inputResponses: [{ name: 'confirm', value: true }] },
    };
    client.receive(retry);
    expect(server.sent[1]).toEqual(retry);
  });
});

/** A discover-only server: no initialize handler, answers server/discover with a tool list. */
function discoverOnlyServer(toolCount: number) {
  const state: { discoverMeta?: unknown; sawInitialize: boolean } = { sawInitialize: false };
  let onMsg: ((m: JsonRpcMessage) => void) | undefined;
  const reply = (id: JsonRpcId, result: unknown) =>
    queueMicrotask(() => onMsg?.({ jsonrpc: '2.0', id, result }));
  const transport: MessageTransport = {
    onMessage: (h) => {
      onMsg = h;
    },
    send: (msg) => {
      if (msg.method === 'initialize') state.sawInitialize = true;
      if (msg.id == null) return;
      if (msg.method === 'server/discover') {
        state.discoverMeta = (msg.params as { _meta?: unknown })?._meta;
        reply(msg.id, { tools: Array.from({ length: toolCount }, (_, i) => ({ name: `t${i}` })) });
      }
    },
    close: () => {},
  };
  return { transport, state };
}

describe('handshake stateless discover probe (S17.6)', () => {
  it('probes via server/discover with the version in _meta, no initialize sent', async () => {
    const { transport, state } = discoverOnlyServer(4);
    const res = await handshake(transport, { mode: 'stateless', timeoutMs: 500 });
    expect(state.sawInitialize).toBe(false);
    expect(res.reachable).toBe(true);
    expect(res.toolCount).toBe(4);
    expect(res.protocolVersion).toBe(PREFERRED_PROTOCOL_VERSION);
    expect(state.discoverMeta).toEqual({ [META_PROTOCOL_VERSION_KEY]: PREFERRED_PROTOCOL_VERSION });
  });
});
