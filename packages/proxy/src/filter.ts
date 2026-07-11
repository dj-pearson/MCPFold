import type { ToolsDirective } from '@mcpfold/core';

/**
 * Tool allow/deny filtering (S5.2). `mode: "allow"` keeps only listed tools; `mode: "deny"`
 * removes listed tools. Order is preserved and surviving tool objects (schemas) are passed
 * through untouched.
 */

export interface McpTool {
  name: string;
  [key: string]: unknown;
}

/**
 * Normalize a tool name for allow/deny matching (S22.12). MCP tool names are case- and
 * whitespace-insensitive in practice across servers, so a deny of `foo` must also cover `FOO`,
 * `foo `, and ` Foo` — otherwise a spelling variant the server honors slips past the filter. Applied
 * to BOTH the directive list and the queried name so the `tools/list` filter and the `tools/call`
 * guard agree by construction.
 */
function normalizeToolName(name: string): string {
  return name.trim().toLowerCase();
}

export function isToolAllowed(name: string, directive: ToolsDirective): boolean {
  const target = normalizeToolName(name);
  const listed = directive.list.some((entry) => normalizeToolName(entry) === target);
  return directive.mode === 'allow' ? listed : !listed;
}

/** Filter a tools array by the directive, preserving order and schemas. */
export function filterTools<T extends McpTool>(tools: T[], directive: ToolsDirective): T[] {
  return tools.filter((tool) => isToolAllowed(tool.name, directive));
}
