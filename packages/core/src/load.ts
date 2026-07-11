import {
  findNodeAtLocation,
  parseTree,
  printParseErrorCode,
  type ParseError as JsoncParseError,
  type Node as JsoncNode,
} from 'jsonc-parser';
import { ConfigSchema } from './schema.js';
import { detectVersion, migrateConfig, SCHEMA_VERSION } from './migrate/index.js';
import type { Config } from './types.js';

/**
 * The single entry point every consumer uses to read a canonical config (S1.2).
 *
 * Parses JSONC (comments, trailing commas) then validates against the zod schema,
 * mapping both syntax errors and validation issues back to source line/column and the
 * offending JSON path. Returns a discriminated result rather than throwing so `doctor`
 * can enumerate every problem at once.
 */

export type ConfigErrorCode = 'jsonc-parse' | 'schema';

/**
 * Keys that mutate an object's prototype instead of creating an own property (S22.3). `__proto__`
 * invokes the prototype setter under bracket assignment; `constructor`/`prototype` are the classic
 * pollution pivots. None is ever a legitimate key in a canonical config, so a literal occurrence is
 * a hard schema error — otherwise a body nested under `__proto__` validates as an empty config and
 * silently bypasses the strict schema (real servers/profiles vanish).
 */
const PROTO_POLLUTION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Walk a parsed JSONC tree for the first property key that could pollute a prototype. */
function findProtoPollutionKey(node: JsoncNode): JsoncNode | undefined {
  if (node.type === 'object') {
    for (const child of node.children ?? []) {
      if (child.type === 'property' && child.children && child.children.length === 2) {
        const keyNode = child.children[0]!;
        if (PROTO_POLLUTION_KEYS.has(keyNode.value as string)) return keyNode;
        const nested = findProtoPollutionKey(child.children[1]!);
        if (nested) return nested;
      }
    }
  } else if (node.type === 'array') {
    for (const child of node.children ?? []) {
      const nested = findProtoPollutionKey(child);
      if (nested) return nested;
    }
  }
  return undefined;
}

export interface PositionedError {
  code: ConfigErrorCode;
  message: string;
  /** JSON path to the offending value, e.g. `servers.github.auth.token`. */
  path?: string;
  /** 1-based line number in the source text. */
  line?: number;
  /** 1-based column number in the source text. */
  column?: number;
  /** Actionable fix hint where one applies. */
  hint?: string;
}

export type LoadResult = { ok: true; config: Config } | { ok: false; errors: PositionedError[] };

/** Convert a 0-based character offset into 1-based line/column. */
export function offsetToLineCol(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let column = 1;
  const bound = Math.min(offset, text.length);
  for (let i = 0; i < bound; i++) {
    if (text.charCodeAt(i) === 10 /* \n */) {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column };
}

function hintForSchemaIssue(path: string, message: string): string | undefined {
  if (message.includes('secret reference')) {
    return 'Use ${scheme:path}, e.g. ${env:GITHUB_PAT}. Never inline a token value.';
  }
  if (message.includes('stdio servers need')) {
    return 'Set `command` for stdio, or `url` for http/sse transports.';
  }
  if (message.includes('`path` is required')) {
    return 'Add a `path` to this profile (project/workspace scopes need one).';
  }
  if (path === 'version') {
    return 'The canonical format is version 2: set "version": 2 (run `mcpfold migrate` to upgrade a v1 file).';
  }
  if (message.toLowerCase().includes('unrecognized key')) {
    return 'Remove the unknown key — the canonical schema is strict about field names.';
  }
  return undefined;
}

/**
 * Load and validate a canonical config from JSONC source text.
 */
export function loadConfig(text: string): LoadResult {
  const parseErrors: JsoncParseError[] = [];
  const tree = parseTree(text, parseErrors, {
    allowTrailingComma: true,
    disallowComments: false,
  });

  if (parseErrors.length > 0) {
    return {
      ok: false,
      errors: parseErrors.map((e) => {
        const { line, column } = offsetToLineCol(text, e.offset);
        return {
          code: 'jsonc-parse' as const,
          message: `JSONC syntax error: ${printParseErrorCode(e.error)}`,
          line,
          column,
          hint: 'Fix the JSON syntax — comments and trailing commas are allowed, but this token is not.',
        };
      }),
    };
  }

  if (!tree) {
    return {
      ok: false,
      errors: [
        { code: 'jsonc-parse', message: 'Empty or unparseable config.', line: 1, column: 1 },
      ],
    };
  }

  // Reject prototype-pollution keys BEFORE reconstruction/validation (S22.3). A `__proto__`-bodied
  // document would otherwise validate as an empty config, bypassing the strict schema.
  const polluted = findProtoPollutionKey(tree);
  if (polluted) {
    const { line, column } = offsetToLineCol(text, polluted.offset);
    return {
      ok: false,
      errors: [
        {
          code: 'schema',
          message: `Illegal key "${String(polluted.value)}" — __proto__, constructor, and prototype are not allowed in a config.`,
          line,
          column,
          hint: 'Remove this key; it is reserved and cannot appear anywhere in a config.',
        },
      ],
    };
  }

  // Parse the concrete value from the same text (tree gives us positions; value gives us data).
  const value = nodeToValue(tree);

  // Detect a config authored by a NEWER mcpfold before schema validation, so the user gets
  // an actionable "upgrade" message instead of a confusing literal-mismatch error (S0.7).
  const version = detectVersion(value);
  if (version > SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [
        {
          code: 'schema',
          message: `This config is version ${version}, newer than this mcpfold supports (v${SCHEMA_VERSION}).`,
          path: 'version',
          line: 1,
          column: 1,
          hint: 'Upgrade mcpfold (npm i -g mcpfold@latest) to read this config.',
        },
      ],
    };
  }

  // An older config auto-migrates in-memory so it keeps loading (S17.5); `mcpfold migrate` is what
  // persists the upgrade to disk. Validation then always runs against the current (v2) schema.
  const toValidate =
    version < SCHEMA_VERSION && value && typeof value === 'object'
      ? migrateConfig(value as Record<string, unknown>, SCHEMA_VERSION).config
      : value;

  const result = ConfigSchema.safeParse(toValidate);
  if (result.success) {
    return { ok: true, config: result.data };
  }

  const errors: PositionedError[] = result.error.issues.map((issue) => {
    const pathArr = issue.path.map((p) => (typeof p === 'number' ? p : String(p)));
    const path = pathArr.join('.');
    const node = pathArr.length > 0 ? findNodeAtLocation(tree, pathArr) : tree;
    const offset = node?.offset ?? tree.offset;
    const { line, column } = offsetToLineCol(text, offset);
    return {
      code: 'schema' as const,
      message: issue.message,
      path: path || undefined,
      line,
      column,
      hint: hintForSchemaIssue(path, issue.message),
    };
  });

  return { ok: false, errors };
}

/**
 * Load and validate, throwing an aggregate error on failure. Convenience wrapper for
 * call sites that prefer exceptions over the result type.
 */
export function loadConfigOrThrow(text: string): Config {
  const result = loadConfig(text);
  if (result.ok) return result.config;
  const lines = result.errors.map(
    (e) =>
      `  [${e.line}:${e.column}] ${e.path ? `${e.path}: ` : ''}${e.message}` +
      (e.hint ? `\n      → ${e.hint}` : ''),
  );
  throw new Error(`Invalid mcp.config.jsonc:\n${lines.join('\n')}`);
}

/** Reconstruct a plain JS value from a jsonc-parser tree node. */
function nodeToValue(node: JsoncNode): unknown {
  switch (node.type) {
    case 'object': {
      // Object.create(null) so a `__proto__` key (if one ever reached here) creates an own property
      // via [[Set]] instead of invoking the prototype setter — defense in depth behind the
      // findProtoPollutionKey gate (S22.3).
      const obj = Object.create(null) as Record<string, unknown>;
      for (const child of node.children ?? []) {
        if (child.type === 'property' && child.children && child.children.length === 2) {
          const key = child.children[0]!.value as string;
          obj[key] = nodeToValue(child.children[1]!);
        }
      }
      return obj;
    }
    case 'array':
      return (node.children ?? []).map(nodeToValue);
    default:
      return node.value;
  }
}
