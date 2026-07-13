/**
 * Pure, dependency-free tool-schema token estimator for the inline config budget (S21.2).
 *
 * It is a faithful copy of the committed benchmark methodology in
 * apps/site/src/benchmark/model.ts — itself a port of packages/proxy/bench/context-benchmark.ts
 * (S5.4 / S13.2): 1 token ≈ 4 characters of serialized JSON, measured over a representative MCP
 * tool shape. `test/tokenBudget.test.ts` asserts this module reproduces the benchmark model's
 * numbers, so the extension can never drift from the published method.
 *
 * The counts are ESTIMATES. Until S21.4 collects real `tools/list` data per server, we don't know
 * how many tools a given server exposes, so we assume a representative count and every figure is
 * labeled approximate in the UI. This module imports nothing from `vscode`, so it is unit-testable
 * in a plain Node environment.
 */

/** 1 token ≈ 4 characters of serialized JSON — the documented benchmark tokenizer. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

interface McpTool {
  name: string;
  description: string;
  inputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
}

/** A representative tool, byte-for-byte identical to the benchmark model's `tool()`. */
function tool(name: string, description: string, props: number): McpTool {
  const properties: Record<string, unknown> = {};
  for (let i = 0; i < props; i++) {
    properties[`arg_${i}`] = {
      type: 'string',
      description: `Parameter ${i} for ${name}: provide a well-formed value describing the ${i}th input.`,
    };
  }
  return {
    name,
    description,
    inputSchema: { type: 'object', properties, required: Object.keys(properties).slice(0, 1) },
  };
}

/** `count` representative tools for a server, matching the benchmark model's `makeTools()`. */
function makeTools(prefix: string, count: number): McpTool[] {
  return Array.from({ length: count }, (_, i) =>
    tool(`${prefix}_${i}`, `Perform operation ${i} on the ${prefix} service with typed inputs.`, 4),
  );
}

/**
 * Representative tool count per server, used when the real count is unknown (pre-S21.4). The
 * published fixture averages 15 tools/server (github 20, supabase 15, playwright 10).
 */
export const REPRESENTATIVE_TOOL_COUNT = 15;

/** Estimated tool-schema token cost a server adds to the model's context window. */
export function estimateServerTokens(name: string, toolCount = REPRESENTATIVE_TOOL_COUNT): number {
  return estimateTokens(JSON.stringify(makeTools(name, Math.max(0, toolCount))));
}

export interface ServerBudget {
  /** Server key as written in the config. */
  name: string;
  /** 0-based line of the server key, for anchoring a CodeLens. */
  line: number;
  /** Tool count assumed for the estimate (representative until S21.4). */
  toolCount: number;
  /** Estimated tool-schema tokens for this server. */
  tokens: number;
  /** True while the count is a representative estimate rather than collected data. */
  approximate: boolean;
}

export interface ConfigBudget {
  /** One entry per server under the top-level `servers` object, in document order. */
  servers: ServerBudget[];
  /** Sum of every server's estimated tokens. */
  totalTokens: number;
  /** 0-based line of the `servers` key, for the file-total CodeLens (−1 if absent). */
  serversLine: number;
}

interface Frame {
  /** The object key whose value opened this frame (null for the root or an array). */
  introKey: string | null;
}

/**
 * Locate each server under the top-level `servers` object in a JSONC config and estimate its
 * tool-schema token cost. A minimal comment/string-aware scanner tracks brace depth so only the
 * direct keys of the `servers` object count as servers — not the keys inside each server's own body
 * (`command`, `args`, …) and not a `servers` key nested deeper in the tree. Servers are returned in
 * document order. `toolCountFor` lets a caller supply real counts once S21.4 provides them; it
 * defaults to the representative estimate.
 */
export function computeConfigBudget(
  text: string,
  toolCountFor: (name: string) => number = () => REPRESENTATIVE_TOOL_COUNT,
): ConfigBudget {
  const servers: ServerBudget[] = [];
  let serversLine = -1;

  let line = 0;
  let inString = false;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;
  let current = '';
  let stringLine = 0;
  // The most recent complete string token and the line it started on (a candidate object key).
  let lastString: string | null = null;
  let lastStringLine = 0;

  const frames: Frame[] = [];
  let pendingKey: string | null = null; // the key awaiting its value; sets the next frame's introKey

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = i + 1 < text.length ? text[i + 1] : '';

    if (ch === '\n') {
      line++;
      inLineComment = false;
      continue;
    }
    if (inLineComment) continue;
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inString) {
      if (escaped) {
        escaped = false;
        current += ch;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
        lastString = current;
        lastStringLine = stringLine;
      } else {
        current += ch;
      }
      continue;
    }

    // Not inside a string or comment.
    if (ch === '/' && next === '/') {
      inLineComment = true;
      i++;
    } else if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
    } else if (ch === '"') {
      inString = true;
      current = '';
      stringLine = line;
    } else if (ch === ':') {
      // The preceding string is an object key. Record it if we're directly inside `servers`.
      if (lastString !== null) {
        const parent = frames.length > 0 ? frames[frames.length - 1].introKey : null;
        if (frames.length === 1 && lastString === 'servers') serversLine = lastStringLine;
        if (parent === 'servers') {
          const count = toolCountFor(lastString);
          servers.push({
            name: lastString,
            line: lastStringLine,
            toolCount: count,
            tokens: estimateServerTokens(lastString, count),
            approximate: true,
          });
        }
        pendingKey = lastString;
      }
      lastString = null;
    } else if (ch === '{') {
      frames.push({ introKey: pendingKey });
      pendingKey = null;
      lastString = null;
    } else if (ch === '[') {
      frames.push({ introKey: null });
      pendingKey = null;
      lastString = null;
    } else if (ch === '}' || ch === ']') {
      frames.pop();
      pendingKey = null;
      lastString = null;
    } else if (ch === ',') {
      pendingKey = null;
      lastString = null;
    }
  }

  const totalTokens = servers.reduce((sum, s) => sum + s.tokens, 0);
  return { servers, totalTokens, serversLine };
}
