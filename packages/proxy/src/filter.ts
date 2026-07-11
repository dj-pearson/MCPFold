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

/** A directive precompiled for O(1) membership tests (S22.24). */
export interface CompiledDirective {
  /** True if a tool by this name is allowed under the directive. */
  allows(name: string): boolean;
}

/**
 * Precompile a directive into a normalized `Set` for O(1) membership (S22.24). The old
 * `list.includes` scan was O(n) per tool → O(n*m) filtering on the `tools/call` hot path; compiling
 * once makes both the `tools/list` filter and the `tools/call` guard O(1) per tool.
 */
export function compileDirective(directive: ToolsDirective): CompiledDirective {
  const set = new Set(directive.list.map(normalizeToolName));
  const allowMode = directive.mode === 'allow';
  return {
    allows(name) {
      const listed = set.has(normalizeToolName(name));
      return allowMode ? listed : !listed;
    },
  };
}

export function isToolAllowed(name: string, directive: ToolsDirective): boolean {
  return compileDirective(directive).allows(name);
}

/** Filter a tools array by the directive, preserving order and schemas. */
export function filterTools<T extends McpTool>(tools: T[], directive: ToolsDirective): T[] {
  // Compile once (O(m)), then O(1) per tool — instead of O(n*m).
  const compiled = compileDirective(directive);
  return tools.filter((tool) => compiled.allows(tool.name));
}
