import { describe, expect, it } from 'vitest';
import {
  handshake,
  PREFERRED_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '../src/handshake.js';
import type { JsonRpcId, JsonRpcMessage } from '../src/jsonrpc.js';
import type { MessageTransport } from '../src/transport/types.js';

/**
 * S17.4 — a mock server that always answers `initialize` with `serverVersion` (its counter-offer)
 * and `tools/list` with `toolCount` tools. Records the version we offered and any negotiated
 * version pushed back via setProtocolVersion.
 */
function fakeServer(serverVersion: string, toolCount = 0) {
  const state: { offered?: string; negotiated?: string } = {};
  let onMsg: ((m: JsonRpcMessage) => void) | undefined;
  const reply = (id: JsonRpcId, result: unknown) =>
    queueMicrotask(() => onMsg?.({ jsonrpc: '2.0', id, result }));
  const transport: MessageTransport = {
    onMessage: (h) => {
      onMsg = h;
    },
    send: (msg) => {
      if (msg.id == null) return; // notification
      if (msg.method === 'initialize') {
        state.offered = (msg.params as { protocolVersion?: string })?.protocolVersion;
        reply(msg.id, { protocolVersion: serverVersion });
      } else if (msg.method === 'tools/list') {
        reply(msg.id, { tools: Array.from({ length: toolCount }, (_, i) => ({ name: `t${i}` })) });
      }
    },
    close: () => {},
    setProtocolVersion: (v) => {
      state.negotiated = v;
    },
  };
  return { transport, state };
}

describe('handshake protocol negotiation (S17.4)', () => {
  it('offers the newest supported version by default', async () => {
    const { transport, state } = fakeServer(PREFERRED_PROTOCOL_VERSION, 2);
    const res = await handshake(transport, { timeoutMs: 500 });
    expect(state.offered).toBe(PREFERRED_PROTOCOL_VERSION);
    expect(res.offeredVersion).toBe(PREFERRED_PROTOCOL_VERSION);
    expect(res.protocolVersion).toBe(PREFERRED_PROTOCOL_VERSION);
    expect(res.protocolSupported).toBe(true);
    expect(res.toolCount).toBe(2);
  });

  for (const server of SUPPORTED_PROTOCOL_VERSIONS) {
    it(`negotiates down to a server speaking ${server}`, async () => {
      const { transport, state } = fakeServer(server, 1);
      const res = await handshake(transport, { timeoutMs: 500 });
      // We still OFFER the newest, but accept the server's counter-offer as the negotiated version.
      expect(state.offered).toBe(PREFERRED_PROTOCOL_VERSION);
      expect(res.protocolVersion).toBe(server);
      expect(res.protocolSupported).toBe(true);
      // The negotiated version is pushed to the transport (for the HTTP header).
      expect(state.negotiated).toBe(server);
    });
  }

  it('honors an explicit preferredVersion offer (old clients / pinning)', async () => {
    const { transport, state } = fakeServer('2024-11-05');
    const res = await handshake(transport, { timeoutMs: 500, preferredVersion: '2024-11-05' });
    expect(state.offered).toBe('2024-11-05');
    expect(res.protocolVersion).toBe('2024-11-05');
  });

  it('flags an unsupported negotiated version but stays reachable', async () => {
    const { transport } = fakeServer('2099-01-01', 0);
    const res = await handshake(transport, { timeoutMs: 500 });
    expect(res.reachable).toBe(true);
    expect(res.protocolVersion).toBe('2099-01-01');
    expect(res.protocolSupported).toBe(false);
  });

  // S22.13: an unsupported version must abort the handshake before tools/list and before the version
  // is echoed as the MCP-Protocol-Version header.
  it('does not complete the handshake for an unsupported version — no tools/list, no header echo', async () => {
    const { transport, state } = fakeServer('2099-01-01', 5); // server claims 5 tools
    const res = await handshake(transport, { timeoutMs: 500 });
    expect(res.reachable).toBe(true);
    expect(res.protocolSupported).toBe(false);
    // tools/list was NOT sent, so no tools are reported despite the server offering 5.
    expect(res.toolCount).toBe(0);
    expect(res.tools).toEqual([]);
    // The unsupported version was never pushed to the transport as the MCP-Protocol-Version header.
    expect(state.negotiated).toBeUndefined();
  });

  it('rejects a null initialize result as unreachable (S22.13)', async () => {
    let onMsg: ((m: JsonRpcMessage) => void) | undefined;
    const transport: MessageTransport = {
      onMessage: (h) => {
        onMsg = h;
      },
      send: (msg) => {
        if (msg.id != null && msg.method === 'initialize') {
          queueMicrotask(() => onMsg?.({ jsonrpc: '2.0', id: msg.id!, result: null }));
        }
      },
      close: () => {},
    };
    const res = await handshake(transport, { timeoutMs: 500 });
    expect(res.reachable).toBe(false);
    expect(res.error).toMatch(/non-object/);
  });

  it('does not pin a single hardcoded date — the supported table is ordered oldest→newest', () => {
    expect(SUPPORTED_PROTOCOL_VERSIONS[0]).toBe('2024-11-05');
    expect(SUPPORTED_PROTOCOL_VERSIONS.at(-1)).toBe(PREFERRED_PROTOCOL_VERSION);
    expect(SUPPORTED_PROTOCOL_VERSIONS.length).toBeGreaterThanOrEqual(4);
  });
});
