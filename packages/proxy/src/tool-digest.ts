import { createHash } from 'node:crypto';
import type { McpTool } from './filter.js';

/**
 * Tool-definition pinning (S18.1) — rug-pull / tool-poisoning defense (OWASP MCP03:2025).
 *
 * Malicious instructions live in tools/list DESCRIPTIONS and enter the model's context before any
 * call; a server that shipped 15 clean versions can mutate its definitions after trust is
 * established. TOFU (S9.2) only pins the launch command. This module produces a stable digest of a
 * server's *tool surface* (names + descriptions + input schemas) so drift can be detected, and a
 * human-readable diff of what changed so the user can decide whether to re-trust.
 *
 * The canonical form is order-insensitive (tools sorted by name) and whitespace-stable
 * (descriptions trimmed, schema object keys sorted deep) so benign reordering or reformatting never
 * false-positives.
 */

/** The pinned, canonical surface of a single tool. */
export interface CanonicalTool {
  name: string;
  description: string;
  /** sha256 of the deep-key-sorted input schema (empty string when absent). */
  schemaDigest: string;
}

/** Deep-sort object keys so serialization is stable regardless of author key order. */
function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    // Object.create(null) so a `__proto__` key in a tool's schema creates an OWN property (and is
    // therefore included in the digest) instead of invoking the prototype setter and silently
    // vanishing — otherwise a server could mutate its `__proto__` schema key to evade drift
    // detection (S22.23 / S18.1 pinning).
    const out = Object.create(null) as Record<string, unknown>;
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Normalize a description: collapse internal whitespace and trim, so reformatting is benign. */
function normalizeDescription(description: unknown): string {
  return typeof description === 'string' ? description.replace(/\s+/g, ' ').trim() : '';
}

/** The input schema under either MCP key (`inputSchema`, older `input_schema`). */
function schemaOf(tool: McpTool): unknown {
  return (
    (tool as { inputSchema?: unknown; input_schema?: unknown }).inputSchema ??
    (tool as { input_schema?: unknown }).input_schema
  );
}

/** Reduce a live tools array to its canonical, order-insensitive surface. */
export function canonicalizeTools(tools: McpTool[]): CanonicalTool[] {
  return tools
    .map((tool) => {
      const schema = schemaOf(tool);
      return {
        name: tool.name,
        description: normalizeDescription(tool.description),
        schemaDigest: schema === undefined ? '' : sha256(JSON.stringify(sortDeep(schema))),
      };
    })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** A single stable digest of the whole tool surface. */
export function toolDefinitionsDigest(tools: McpTool[]): string {
  return sha256(JSON.stringify(canonicalizeTools(tools)));
}

/** Digest of an already-canonical surface (e.g. one loaded from the trust store). */
export function digestOfCanonical(surface: CanonicalTool[]): string {
  const sorted = [...surface].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return sha256(JSON.stringify(sorted));
}

export interface ChangedTool {
  name: string;
  descriptionChanged: boolean;
  schemaChanged: boolean;
  oldDescription?: string;
  newDescription?: string;
}

export interface ToolSurfaceDiff {
  added: string[];
  removed: string[];
  changed: ChangedTool[];
}

/** True when the diff represents any drift at all. */
export function hasToolDrift(diff: ToolSurfaceDiff): boolean {
  return diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0;
}

/** Compare a trusted canonical surface to a live one; report added/removed/changed tools. */
export function diffToolSurface(trusted: CanonicalTool[], live: CanonicalTool[]): ToolSurfaceDiff {
  const trustedByName = new Map(trusted.map((t) => [t.name, t]));
  const liveByName = new Map(live.map((t) => [t.name, t]));

  const added = live
    .filter((t) => !trustedByName.has(t.name))
    .map((t) => t.name)
    .sort();
  const removed = trusted
    .filter((t) => !liveByName.has(t.name))
    .map((t) => t.name)
    .sort();

  const changed: ChangedTool[] = [];
  for (const [name, before] of trustedByName) {
    const after = liveByName.get(name);
    if (!after) continue;
    const descriptionChanged = before.description !== after.description;
    const schemaChanged = before.schemaDigest !== after.schemaDigest;
    if (descriptionChanged || schemaChanged) {
      changed.push({
        name,
        descriptionChanged,
        schemaChanged,
        oldDescription: descriptionChanged ? before.description : undefined,
        newDescription: descriptionChanged ? after.description : undefined,
      });
    }
  }
  changed.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { added, removed, changed };
}

/** A one-line-per-item human summary of a tool-surface diff (safe to print; no secrets). */
export function renderToolSurfaceDiff(diff: ToolSurfaceDiff): string {
  const lines: string[] = [];
  for (const name of diff.added) lines.push(`  + added tool "${name}"`);
  for (const name of diff.removed) lines.push(`  - removed tool "${name}"`);
  for (const c of diff.changed) {
    const what = [c.descriptionChanged && 'description', c.schemaChanged && 'schema']
      .filter(Boolean)
      .join(' + ');
    lines.push(`  ~ tool "${c.name}" ${what} changed`);
    if (c.descriptionChanged) {
      lines.push(`      was: ${c.oldDescription}`);
      lines.push(`      now: ${c.newDescription}`);
    }
  }
  return lines.join('\n');
}
