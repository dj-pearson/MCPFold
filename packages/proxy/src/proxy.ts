import type { ToolsDirective } from '@mcpfold/core';
import { noopAuditRecorder, type AuditRecorder } from './audit.js';
import {
  errorResponse,
  isRequest,
  isResponse,
  type JsonRpcId,
  type JsonRpcMessage,
} from './jsonrpc.js';
import { compileDirective, filterTools, type McpTool } from './filter.js';
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
  /** Opt-in redacted audit recorder for tool calls / drift (S18.4). Defaults to a no-op. */
  audit?: AuditRecorder;
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
  // S22.24: compile the directive once into an O(1) matcher for the tools/call hot path.
  const compiledDirective = directive ? compileDirective(directive) : undefined;
  const rejectFiltered = options.rejectFilteredCalls ?? true;
  const pinned = options.pinnedTools;
  const pinnedMode = pinned?.mode ?? 'warn';
  const audit = options.audit ?? noopAuditRecorder;
  // Track in-flight request ids whose responses carry a tool list to curate or verify — both the
  // session-mode `tools/list` and the stateless-core `server/discover`.
  const pendingToolListing = new Set<JsonRpcId>();

  client.onMessage((message) => {
    // Reject calls to filtered-out tools before they ever reach the real server. `tools/call` keeps
    // its `params.name` shape in stateless mode, so this enforcement is mode-agnostic. S22.12: the
    // filter applies whether the call is a request (has id) OR a NOTIFICATION (no id) — otherwise a
    // notification-form call to a blocked tool would skip the check and fire-and-forget at the server.
    if (isRequest(message, 'tools/call')) {
      const name = callToolName(message);
      if (compiledDirective && rejectFiltered && name && !compiledDirective.allows(name)) {
        audit.denied(name, 'filtered by mcpfold');
        // A request gets an error response; a notification has no id to respond to, so it is simply
        // dropped. Either way the blocked tool never reaches the server.
        if (message.id !== undefined) {
          client.send(
            errorResponse(message.id, {
              code: METHOD_NOT_FOUND,
              message: `Tool "${name}" is not available (filtered by mcpfold).`,
            }),
          );
        }
        return;
      }
      // Record the start so the response can be timed and its outcome logged (S18.4).
      if (message.id !== undefined) audit.callStart(message.id, name, message.params);
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
    // Close out an audited tool call as soon as its response returns (S18.4). Harmless no-op for
    // any response id that wasn't a tracked tools/call (e.g. a tools/list response).
    if (isResponse(message) && message.id !== undefined) {
      audit.callEnd(message.id, message.error !== undefined ? 'error' : 'ok');
    }
    if (message.id !== undefined && pendingToolListing.has(message.id)) {
      // S22.13: evict on ANY response for a tracked id. A server that answers a tools/list with an
      // error or a non-tools result would otherwise leak an entry per request (no TTL/cap). Only a
      // genuine tools result is curated; anything else falls through and forwards unfiltered.
      pendingToolListing.delete(message.id);
      if ((directive || pinned) && isToolsResult(message.result)) {
        // Tool-definition pinning (S18.1): verify the live surface against the trusted one BEFORE
        // filtering, so drift is measured against everything the server actually offers.
        if (pinned) {
          const diff = diffToolSurface(pinned.surface, canonicalizeTools(message.result.tools));
          if (hasToolDrift(diff)) {
            pinned.onDrift?.(diff);
            audit.drift(
              `${diff.added.length} added, ${diff.removed.length} removed, ${diff.changed.length} changed`,
            );
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

        const tools = directive
          ? filterTools(message.result.tools, directive)
          : message.result.tools;
        // Spread the original result so `_meta` and any other discover fields survive untouched.
        client.send({ ...message, result: { ...message.result, tools } });
        return;
      }
    }
    // Everything else (MRTR input_required results, _meta-carrying messages, notifications,
    // errors) forwards verbatim — no rewriting, so stateless-core traffic is never corrupted.
    client.send(message);
  });

  // S22.10: tear the whole session down exactly once — whether the caller disposes explicitly or
  // either transport signals a stream error/EOF (a crashing or flooding server). Guarded so the
  // close() calls below don't re-enter through the peers' own onClose handlers.
  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    client.close();
    server.close();
  };
  client.onClose?.(dispose);
  server.onClose?.(dispose);

  return dispose;
}
