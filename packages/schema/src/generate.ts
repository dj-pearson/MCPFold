import { zodToJsonSchema } from 'zod-to-json-schema';
import { ConfigSchema } from '@mcpfold/core';

/**
 * Generate the published JSON Schema for `mcp.config.jsonc` from the zod source (S1.5).
 *
 * The schema is the single source of truth for editor autocomplete; the file itself is kept
 * neutral/un-branded (no "mcpfold" in the shape) so it can become a de-facto standard.
 * NOTE: zod `.refine()` cross-field rules (stdio↔command, path-required) cannot be expressed
 * in JSON Schema and are enforced only by the zod loader — the JSON Schema covers structure,
 * enums, the secret-reference pattern, and strict unknown-key rejection.
 */
export const SCHEMA_URL = 'https://mcpfold.com/schema/v1.json';

export function generateSchema(): Record<string, unknown> {
  const jsonSchema = zodToJsonSchema(ConfigSchema, {
    name: 'McpfoldConfig',
    target: 'jsonSchema7',
  });
  return { $id: SCHEMA_URL, ...jsonSchema };
}

export function generateSchemaText(): string {
  return `${JSON.stringify(generateSchema(), null, 2)}\n`;
}
