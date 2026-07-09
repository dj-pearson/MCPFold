import { isResponse, type JsonRpcId, type JsonRpcMessage } from './jsonrpc.js';
import type { McpTool } from './filter.js';
import type { MessageTransport } from './transport/types.js';

/** Coerce a tools/list or discover result's `tools` into a typed array (drops malformed entries). */
function toolsFrom(result: { tools?: unknown[] } | null): McpTool[] {
  if (!Array.isArray(result?.tools)) return [];
  return result!.tools!.filter(
    (t): t is McpTool => Boolean(t) && typeof (t as { name?: unknown }).name === 'string',
  );
}

/**
 * MCP initialize + tools/list handshake (S10.4) over any {@link MessageTransport}. Transport-
 * agnostic — the CLI `test` command drives it over a spawned stdio process or an HTTP transport,
 * and tests drive it over an in-memory mock. Confirms a server actually initializes and can list
 * its tools, with a bounded per-request timeout so a hung server aborts cleanly (S0.9).
 */

/**
 * Known MCP protocol versions, oldest → newest. The lineage is
 * 2024-11-05 → 2025-03-26 → 2025-06-18 → 2025-11-25. We offer the newest by default and accept the
 * server's counter-offer per the spec's version-negotiation rules.
 */
export const SUPPORTED_PROTOCOL_VERSIONS = [
  '2024-11-05',
  '2025-03-26',
  '2025-06-18',
  '2025-11-25',
] as const;

export type ProtocolVersion = (typeof SUPPORTED_PROTOCOL_VERSIONS)[number];

/** The newest supported stable version — what mcpfold announces unless told otherwise. */
export const PREFERRED_PROTOCOL_VERSION: ProtocolVersion = '2025-11-25';

/**
 * @deprecated Retained for back-compat. Use {@link PREFERRED_PROTOCOL_VERSION} for the version to
 * offer, or {@link SUPPORTED_PROTOCOL_VERSIONS} for the full set. This is the OLDEST supported
 * version, not a value any call site should pin to.
 */
export const MCP_PROTOCOL_VERSION: ProtocolVersion = SUPPORTED_PROTOCOL_VERSIONS[0];

/** True if `version` is one mcpfold knows how to speak. */
export function isSupportedProtocolVersion(version: string): version is ProtocolVersion {
  return (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(version);
}

export interface HandshakeResult {
  reachable: boolean;
  /** The version the server settled on (its `initialize` response), i.e. the negotiated version. */
  protocolVersion?: string;
  /** The version mcpfold offered in `initialize`. */
  offeredVersion?: string;
  /** True when the negotiated version is one mcpfold supports. */
  protocolSupported?: boolean;
  toolCount?: number;
  /** The raw tool definitions returned by tools/list or server/discover (S18.1 pinning probe). */
  tools?: McpTool[];
  /** Present when unreachable — a message safe to print (never the resolved token). */
  error?: string;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

/**
 * The `_meta` key the 2026-07-28 stateless-core revision uses to carry the protocol version on
 * each request (initialize is removed). Provisional — tracked in docs/roadmap.md against the final.
 */
export const META_PROTOCOL_VERSION_KEY = 'io.modelcontextprotocol/protocol-version';

export type HandshakeMode = 'session' | 'stateless';

export async function handshake(
  transport: MessageTransport,
  opts: {
    timeoutMs?: number;
    clientName?: string;
    preferredVersion?: string;
    /**
     * 'session' (default): initialize → tools/list (2025-11-25 and earlier).
     * 'stateless' (S17.6): no initialize; probe via `server/discover` with the version in `_meta`
     * (2026-07-28 revision).
     */
    mode?: HandshakeMode;
  } = {},
): Promise<HandshakeResult> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const offeredVersion = opts.preferredVersion ?? PREFERRED_PROTOCOL_VERSION;
  const mode: HandshakeMode = opts.mode ?? 'session';
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
    // Stateless-core (2026-07-28): no initialize. Carry the version in `_meta` and probe with the
    // mandatory `server/discover`, which returns the tool list directly.
    if (mode === 'stateless') {
      transport.setProtocolVersion?.(offeredVersion);
      const discover = (await request('server/discover', {
        _meta: { [META_PROTOCOL_VERSION_KEY]: offeredVersion },
      })) as { tools?: unknown[] } | null;
      const discoverTools = toolsFrom(discover);
      return {
        reachable: true,
        protocolVersion: offeredVersion,
        offeredVersion,
        protocolSupported: isSupportedProtocolVersion(offeredVersion),
        toolCount: discoverTools.length,
        tools: discoverTools,
      };
    }

    const init = (await request('initialize', {
      protocolVersion: offeredVersion,
      capabilities: {},
      clientInfo: { name: opts.clientName ?? 'mcpfold', version: '1' },
    })) as { protocolVersion?: string } | null;

    // Per spec: the server echoes our version if it supports it, else counter-offers one it does.
    // We accept that negotiated version and, on HTTP, echo it as MCP-Protocol-Version henceforth.
    const negotiated = init?.protocolVersion ?? offeredVersion;
    transport.setProtocolVersion?.(negotiated);

    // MCP requires the client to confirm initialization before other requests.
    transport.send({ jsonrpc: '2.0', method: 'notifications/initialized' });

    const tools = (await request('tools/list', {})) as { tools?: unknown[] } | null;
    const toolList = toolsFrom(tools);
    return {
      reachable: true,
      protocolVersion: negotiated,
      offeredVersion,
      protocolSupported: isSupportedProtocolVersion(negotiated),
      toolCount: toolList.length,
      tools: toolList,
    };
  } catch (err) {
    return { reachable: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    transport.close();
  }
}
