import type { ToolsDirective } from '@mcpfold/core';
import { errorResponse, isRequest, type JsonRpcId, type JsonRpcMessage } from './jsonrpc.js';
import { filterTools, isToolAllowed, type McpTool } from './filter.js';
import type { MessageTransport } from './transport/types.js';

/**
 * The mcpfold MCP proxy (S5.1 core + S5.2 filtering).
 *
 * Wires a client-side transport to a server-side transport and forwards every message
 * faithfully in both directions (request ids, capabilities, notifications, and errors are
 * preserved). When a `tools` directive is supplied it additionally:
 *   - filters `tools/list` RESPONSES to the allow/deny set, and
 *   - (optionally) rejects a `tools/call` to a filtered-out tool with a clear MCP error,
 *     without forwarding it to the real server.
 * With no directive it is a pure passthrough (S5.1). Opt-in; off by default.
 */

// MCP error code for "method/tool not found".
const METHOD_NOT_FOUND = -32601;

export interface ProxyOptions {
  tools?: ToolsDirective;
  /** Reject `tools/call` to a filtered-out tool instead of forwarding it. Default true. */
  rejectFilteredCalls?: boolean;
}

interface ToolsResult {
  tools: McpTool[];
  [key: string]: unknown;
}

function isToolsResult(result: unknown): result is ToolsResult {
  return (
    typeof result === 'object' &&
    result !== null &&
    Array.isArray((result as { tools?: unknown }).tools)
  );
}

function callToolName(message: JsonRpcMessage): string | undefined {
  const params = message.params as { name?: unknown } | undefined;
  return typeof params?.name === 'string' ? params.name : undefined;
}

/**
 * Connect a client transport to a server transport, forwarding messages and applying the
 * optional tools directive. Returns a disposer that closes both transports.
 */
export function connectProxy(
  client: MessageTransport,
  server: MessageTransport,
  options: ProxyOptions = {},
): () => void {
  const directive = options.tools;
  const rejectFiltered = options.rejectFilteredCalls ?? true;
  // Track which in-flight request ids were `tools/list` so we filter only their responses.
  const pendingToolsList = new Set<JsonRpcId>();

  client.onMessage((message) => {
    // Reject calls to filtered-out tools before they ever reach the real server.
    if (
      directive &&
      rejectFiltered &&
      isRequest(message, 'tools/call') &&
      message.id !== undefined
    ) {
      const name = callToolName(message);
      if (name && !isToolAllowed(name, directive)) {
        client.send(
          errorResponse(message.id, {
            code: METHOD_NOT_FOUND,
            message: `Tool "${name}" is not available (filtered by mcpfold).`,
          }),
        );
        return;
      }
    }
    if (directive && isRequest(message, 'tools/list') && message.id !== undefined) {
      pendingToolsList.add(message.id);
    }
    server.send(message);
  });

  server.onMessage((message) => {
    if (
      directive &&
      message.id !== undefined &&
      pendingToolsList.has(message.id) &&
      isToolsResult(message.result)
    ) {
      pendingToolsList.delete(message.id);
      const filtered = filterTools(message.result.tools, directive);
      client.send({ ...message, result: { ...message.result, tools: filtered } });
      return;
    }
    client.send(message);
  });

  return () => {
    client.close();
    server.close();
  };
}
