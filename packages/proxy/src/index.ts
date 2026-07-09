/**
 * @mcpfold/proxy — the local MCP proxy for tool-level curation. Transparent passthrough
 * (S5.1) plus tools/list allow/deny filtering (S5.2).
 */
export {
  parseMessage,
  serializeMessage,
  errorResponse,
  isRequest,
  isResponse,
  type JsonRpcError,
  type JsonRpcId,
  type JsonRpcMessage,
} from './jsonrpc.js';
export {
  connectProxy,
  DISCOVER_METHOD,
  TOOLS_LIST_METHOD,
  type PinnedToolsOptions,
  type ProxyOptions,
} from './proxy.js';
export {
  argumentShape,
  createAuditRecorder,
  fileAuditSink,
  noopAuditRecorder,
  type AuditEvent,
  type AuditOutcome,
  type AuditRecorder,
  type AuditSink,
} from './audit.js';
export { filterTools, isToolAllowed, type McpTool } from './filter.js';
export {
  canonicalizeTools,
  diffToolSurface,
  digestOfCanonical,
  hasToolDrift,
  renderToolSurfaceDiff,
  toolDefinitionsDigest,
  type CanonicalTool,
  type ChangedTool,
  type ToolSurfaceDiff,
} from './tool-digest.js';
export { streamTransport } from './transport/stdio.js';
export { MemoryTransport } from './transport/memory.js';
export type { MessageTransport } from './transport/types.js';
export {
  handshake,
  isSupportedProtocolVersion,
  MCP_PROTOCOL_VERSION,
  META_PROTOCOL_VERSION_KEY,
  PREFERRED_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  type HandshakeMode,
  type HandshakeResult,
  type ProtocolVersion,
} from './handshake.js';
