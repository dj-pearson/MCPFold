import { estimateToolTokens, UsageError, type ResolvedServer } from '@mcpfold/core';
import { handshake, type MessageTransport } from '@mcpfold/proxy';
import { realTransport } from '../util/mcp-transport.js';
import type { SurfaceSnapshot, ToolTokenEstimate } from './cache.js';

/**
 * Live tool-surface discovery (S24.6). Opens a real MCP session to a resolved server, runs the
 * initialize + tools/list handshake (the same machinery as `mcpfold test`), and distills the surface
 * into a REDACTED snapshot: tool names + per-tool / per-server token estimates via the committed
 * benchmark method. Secrets live only in `server.env` / `server.auth` in memory and are never part of
 * the snapshot — it is built purely from the public tools/list schema.
 */

export type TransportFactory = (
  server: ResolvedServer,
) => MessageTransport | Promise<MessageTransport>;

export interface DiscoverOptions {
  timeoutMs?: number;
  /** Injectable transport (tests / alternate probes); defaults to the real stdio/http transport. */
  transportFactory?: TransportFactory;
  /** Injectable clock for deterministic snapshots in tests. */
  now?: () => Date;
}

export async function discoverSurface(
  server: ResolvedServer,
  options: DiscoverOptions = {},
): Promise<SurfaceSnapshot> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const factory = options.transportFactory ?? realTransport;

  let result;
  try {
    const transport = await factory(server);
    result = await handshake(transport, { timeoutMs });
  } catch (err) {
    // A remote server may be unreachable via the direct probe (no local bridge, auth, CORS, etc.);
    // surface a coded, actionable error rather than a silent empty surface.
    throw new UsageError(
      `Could not discover the tool surface of "${server.name}": ${err instanceof Error ? err.message : String(err)}.`,
      { hint: hintFor(server) },
    );
  }
  if (!result.reachable) {
    throw new UsageError(
      `Could not discover the tool surface of "${server.name}": ${result.error ?? 'the server did not complete the MCP handshake'}.`,
      { hint: hintFor(server) },
    );
  }

  const tools: ToolTokenEstimate[] = (result.tools ?? [])
    .map((t) => ({ name: t.name, tokens: estimateToolTokens(t) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const totalTokens = tools.reduce((sum, t) => sum + t.tokens, 0);
  const now = options.now ?? (() => new Date());

  return {
    server: server.name,
    capturedAt: now().toISOString(),
    transport: server.transport,
    protocolVersion: result.protocolVersion,
    toolCount: tools.length,
    totalTokens,
    tools,
  };
}

/** A transport-appropriate hint for a failed discovery. */
function hintFor(server: ResolvedServer): string {
  if (server.transport === 'stdio') {
    return 'Check the launch command and that any required secrets resolve (`mcpfold secret test`).';
  }
  return (
    'Remote discovery probes the server directly over streamable-HTTP; a server reachable only ' +
    'through the mcp-remote bridge (OAuth, SSE-only) cannot be introspected yet. Verify the URL and auth.'
  );
}
