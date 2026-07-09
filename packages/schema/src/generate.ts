import { zodToJsonSchema } from 'zod-to-json-schema';
import { ConfigSchema, PolicySchema } from '@mcpfold/core';

/**
 * Generate the published JSON Schema for `mcp.config.jsonc` from the zod source (S1.5).
 *
 * The schema is the single source of truth for editor autocomplete; the file itself is kept
 * neutral/un-branded (no "mcpfold" in the shape) so it can become a de-facto standard.
 * NOTE: zod `.refine()` cross-field rules (stdio↔command, path-required) cannot be expressed
 * in JSON Schema and are enforced only by the zod loader — the JSON Schema covers structure,
 * enums, the secret-reference pattern, and strict unknown-key rejection.
 */
export const SCHEMA_URL = 'https://mcpfold.com/schema/v2.json';

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

/** The stable URL the org-policy JSON Schema (S18.3) is served from. */
export const POLICY_SCHEMA_URL = 'https://mcpfold.com/schema/policy/v1.json';

/**
 * Generate the published JSON Schema for `mcp.policy.jsonc` (S18.3), from the same zod source the
 * CLI validates against. As with the config schema, `.refine()` cross-field rules (a rule needs at
 * least one matcher) are enforced only by the zod loader.
 */
export function generatePolicySchema(): Record<string, unknown> {
  const jsonSchema = zodToJsonSchema(PolicySchema, {
    name: 'McpfoldPolicy',
    target: 'jsonSchema7',
  });
  return { $id: POLICY_SCHEMA_URL, ...jsonSchema };
}

export function generatePolicySchemaText(): string {
  return `${JSON.stringify(generatePolicySchema(), null, 2)}\n`;
}
