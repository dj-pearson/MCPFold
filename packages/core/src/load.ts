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

/**
 * Iteratively scan raw JSONC text for the offset at which structural nesting first exceeds `max`
 * (S22.6). Runs BEFORE any recursive parse so a pathological document is a clean `ok:false` rather
 * than an uncatchable RangeError — both `parseTree` and `nodeToValue` recurse per level and would
 * otherwise overflow. String contents and line/block comments are skipped so their brackets don't
 * count. O(n), no recursion.
 */
function findExcessiveDepthOffset(text: string, max: number): number | undefined {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '/' && text[i + 1] === '/') {
      const nl = text.indexOf('\n', i + 2);
      if (nl === -1) break;
      i = nl;
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end === -1) break;
      i = end + 1;
    } else if (c === '"') {
      inString = true;
    } else if (c === '{' || c === '[') {
      if (++depth > max) return i;
    } else if (c === '}' || c === ']') {
      if (depth > 0) depth--;
    }
  }
  return undefined;
}

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
  // S22.6: reject pathological nesting up front (iteratively) — parseTree itself recurses per level,
  // so a document with hundreds of thousands of nested brackets would RangeError before we could
  // return, breaking the no-throw contract and DoS-ing the tool.
  const deepAt = findExcessiveDepthOffset(text, MAX_NESTING_DEPTH);
  if (deepAt !== undefined) {
    const { line, column } = offsetToLineCol(text, deepAt);
    return {
      ok: false,
      errors: [
        {
          code: 'schema',
          message: `Config nesting is too deep (exceeds ${MAX_NESTING_DEPTH} levels).`,
          line,
          column,
          hint: 'Flatten the structure — a real config never nests this deeply.',
        },
      ],
    };
  }

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
  // A pathologically nested document is a positioned error, never an uncaught RangeError (S22.6).
  let value: unknown;
  try {
    value = nodeToValue(tree);
  } catch (err) {
    if (err instanceof MaxNestingError) {
      const { line, column } = offsetToLineCol(text, err.offset);
      return {
        ok: false,
        errors: [
          {
            code: 'schema',
            message: `Config nesting is too deep (exceeds ${MAX_NESTING_DEPTH} levels).`,
            line,
            column,
            hint: 'Flatten the structure — a real config never nests this deeply.',
          },
        ],
      };
    }
    throw err;
  }

  // Detect a config authored by a NEWER mcpfold before schema validation, so the user gets
  // an actionable "upgrade" message instead of a confusing literal-mismatch error (S0.7).
  const version = detectVersion(value);

  // A malformed version (0, negative, or fractional) must be a clean schema error, not an uncaught
  // MigrationError out of migrateConfig below — that would crash doctor/sync (S22.7). detectVersion
  // reports any number verbatim; the range/integer check lives here so it can return ok:false.
  if (!Number.isInteger(version) || version < 1) {
    const versionNode = findNodeAtLocation(tree, ['version']);
    const { line, column } = offsetToLineCol(text, versionNode?.offset ?? tree.offset);
    return {
      ok: false,
      errors: [
        {
          code: 'schema',
          message: `Invalid config version ${version} — must be a positive integer (1 or 2).`,
          path: 'version',
          line,
          column,
          hint: 'Set "version": 2 (the current canonical format).',
        },
      ],
    };
  }

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
  // Defense in depth (S22.7): a missing migration step throws MigrationError — never let it escape
  // the no-throw LoadResult contract.
  let toValidate: unknown = value;
  if (version < SCHEMA_VERSION && value && typeof value === 'object') {
    try {
      toValidate = migrateConfig(value as Record<string, unknown>, SCHEMA_VERSION).config;
    } catch (err) {
      const versionNode = findNodeAtLocation(tree, ['version']);
      const { line, column } = offsetToLineCol(text, versionNode?.offset ?? tree.offset);
      return {
        ok: false,
        errors: [
          {
            code: 'schema',
            message: err instanceof Error ? err.message : `Cannot migrate config version ${version}.`,
            path: 'version',
            line,
            column,
            hint: 'Set "version": 2 (the current canonical format), or run `mcpfold migrate`.',
          },
        ],
      };
    }
  }

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

/**
 * Maximum config nesting depth (S22.6). A real canonical config nests only a handful of levels
 * (`servers.<name>.auth.headers.<key>`), so 64 is far beyond any legitimate file while stopping a
 * pathologically nested document (`parseTree` is iterative and tolerates it, but the recursive
 * reconstruction below would otherwise throw an uncatchable RangeError, breaking the no-throw
 * LoadResult contract and DoS-ing the tool).
 */
const MAX_NESTING_DEPTH = 64;

/** Thrown by nodeToValue when depth is exceeded; caught in loadConfig and turned into ok:false. */
class MaxNestingError extends Error {
  constructor(readonly offset: number) {
    super('maximum nesting depth exceeded');
  }
}

/** Reconstruct a plain JS value from a jsonc-parser tree node. */
function nodeToValue(node: JsoncNode, depth = 0): unknown {
  if (depth > MAX_NESTING_DEPTH) throw new MaxNestingError(node.offset);
  switch (node.type) {
    case 'object': {
      // Object.create(null) so a `__proto__` key (if one ever reached here) creates an own property
      // via [[Set]] instead of invoking the prototype setter — defense in depth behind the
      // findProtoPollutionKey gate (S22.3).
      const obj = Object.create(null) as Record<string, unknown>;
      for (const child of node.children ?? []) {
        if (child.type === 'property' && child.children && child.children.length === 2) {
          const key = child.children[0]!.value as string;
          obj[key] = nodeToValue(child.children[1]!, depth + 1);
        }
      }
      return obj;
    }
    case 'array':
      return (node.children ?? []).map((child) => nodeToValue(child, depth + 1));
    default:
      return node.value;
  }
}
