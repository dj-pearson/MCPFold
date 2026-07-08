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
export { connectProxy, type ProxyOptions } from './proxy.js';
export { filterTools, isToolAllowed, type McpTool } from './filter.js';
export { streamTransport } from './transport/stdio.js';
export { MemoryTransport } from './transport/memory.js';
export type { MessageTransport } from './transport/types.js';
