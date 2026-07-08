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

export function isToolAllowed(name: string, directive: ToolsDirective): boolean {
  const listed = directive.list.includes(name);
  return directive.mode === 'allow' ? listed : !listed;
}

/** Filter a tools array by the directive, preserving order and schemas. */
export function filterTools<T extends McpTool>(tools: T[], directive: ToolsDirective): T[] {
  return tools.filter((tool) => isToolAllowed(tool.name, directive));
}
