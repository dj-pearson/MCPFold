import type { ToolsDirective } from '@mcpfold/core';
import { errorResponse, isRequest, type JsonRpcId, type JsonRpcMessage } from './jsonrpc.js';
import { filterTools, isToolAllowed, type McpTool } from './filter.js';
import {
  canonicalizeTools,
  diffToolSurface,
  hasToolDrift,
  type CanonicalTool,
  type ToolSurfaceDiff,
} from './tool-digest.js';
import type { MessageTransport } from './transport/types.js';

/**
 * The mcpfold MCP proxy (S5.1 core + S5.2 filtering + S17.6 stateless-core readiness).
 *
 * Wires a client-side transport to a server-side transport and forwards every message
 * faithfully in both directions (request ids, capabilities, notifications, errors, and per-request
 * `_meta` are preserved verbatim). When a `tools` directive is supplied it additionally:
 *   - filters the tool list in `tools/list` AND `server/discover` RESPONSES to the allow/deny set
 *     (the 2026-07-28 stateless-core revision replaces the initialize/tools-list session with a
 *     mandatory `server/discover`; curation must apply equivalently either way), and
 *   - (optionally) rejects a `tools/call` to a filtered-out tool with a clear MCP error,
 *     without forwarding it to the real server — regardless of session vs stateless mode.
 * With no directive it is a pure passthrough (S5.1). Opt-in; off by default.
 *
 * Everything else — the removal of `initialize`, `_meta`-carried version/identity, MRTR
 * (`resultType: 'input_required'` + retry) — flows through untouched because the proxy never
 * rewrites anything but the tool array of a curated list/discover response. See docs/roadmap.md
 * for the per-item 2026-07-28 RC readiness checklist.
 */

// MCP error code for "method/tool not found".
const METHOD_NOT_FOUND = -32601;

/** The stateless-core (2026-07-28) capability-discovery method that replaces initialize+tools/list. */
export const DISCOVER_METHOD = 'server/discover';
/** The session-mode tool listing method. */
export const TOOLS_LIST_METHOD = 'tools/list';

/**
 * Tool-definition pinning (S18.1). When set, the proxy compares the live tool surface in each
 * `tools/list` / `server/discover` response against the trusted surface and reports drift.
 */
export interface PinnedToolsOptions {
  /** The canonical tool surface recorded at trust time. */
  surface: CanonicalTool[];
  /** 'warn' (default): report drift but forward; 'block': replace the response with an error. */
  mode?: 'warn' | 'block';
  /** Called once per drifted listing with the diff (never with the resolved token/secret). */
  onDrift?: (diff: ToolSurfaceDiff) => void;
}

export interface ProxyOptions {
  tools?: ToolsDirective;
  /** Reject `tools/call` to a filtered-out tool instead of forwarding it. Default true. */
  rejectFilteredCalls?: boolean;
  /** Pin the trusted tool surface and detect/optionally block drift (S18.1). */
  pinnedTools?: PinnedToolsOptions;
}

// MCP error code for a security-policy refusal (invalid params / not permitted).
const SECURITY_BLOCKED = -32000;

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
  const pinned = options.pinnedTools;
  const pinnedMode = pinned?.mode ?? 'warn';
  // Track in-flight request ids whose responses carry a tool list to curate or verify — both the
  // session-mode `tools/list` and the stateless-core `server/discover`.
  const pendingToolListing = new Set<JsonRpcId>();

  client.onMessage((message) => {
    // Reject calls to filtered-out tools before they ever reach the real server. `tools/call`
    // keeps its `params.name` shape in stateless mode, so this enforcement is mode-agnostic.
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
    if (
      (directive || pinned) &&
      message.id !== undefined &&
      (isRequest(message, TOOLS_LIST_METHOD) || isRequest(message, DISCOVER_METHOD))
    ) {
      pendingToolListing.add(message.id);
    }
    server.send(message);
  });

  server.onMessage((message) => {
    if (
      (directive || pinned) &&
      message.id !== undefined &&
      pendingToolListing.has(message.id) &&
      isToolsResult(message.result)
    ) {
      pendingToolListing.delete(message.id);

      // Tool-definition pinning (S18.1): verify the live surface against the trusted one BEFORE
      // filtering, so drift is measured against everything the server actually offers.
      if (pinned) {
        const diff = diffToolSurface(pinned.surface, canonicalizeTools(message.result.tools));
        if (hasToolDrift(diff)) {
          pinned.onDrift?.(diff);
          if (pinnedMode === 'block') {
            // Refuse the whole listing — a drifted server shouldn't inject anything into context.
            client.send(
              errorResponse(message.id, {
                code: SECURITY_BLOCKED,
                message:
                  'Tool definitions changed since you trusted this server (blocked by mcpfold). ' +
                  'Review the diff and re-run `mcpfold trust` to approve.',
              }),
            );
            return;
          }
        }
      }

      const tools = directive ? filterTools(message.result.tools, directive) : message.result.tools;
      // Spread the original result so `_meta` and any other discover fields survive untouched.
      client.send({ ...message, result: { ...message.result, tools } });
      return;
    }
    // Everything else (MRTR input_required results, _meta-carrying messages, notifications,
    // errors) forwards verbatim — no rewriting, so stateless-core traffic is never corrupted.
    client.send(message);
  });

  return () => {
    client.close();
    server.close();
  };
}
