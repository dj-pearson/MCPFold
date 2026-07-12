/**
 * Terminal styling (S23.1) — a tiny, zero-dependency, TTY-aware color layer.
 *
 * The CLI's machine surface stays byte-stable: color is a *display* concern applied only when
 * writing to a real terminal, never to the `--json` envelope (which is built from `data`, not
 * `human`). The default {@link style} instance is disabled unless stdout is a TTY, so command
 * `human` strings render plain under tests, pipes, and CI — every existing snapshot / `.toContain`
 * assertion is unaffected.
 *
 * Precedence follows the ecosystem conventions:
 *   - `FORCE_COLOR=0` / `false`  → force OFF
 *   - `NO_COLOR` (any value)     → OFF   (https://no-color.org)
 *   - `MCPFOLD_NO_COLOR=1`       → OFF   (product-specific opt-out)
 *   - `TERM=dumb`                → OFF
 *   - `FORCE_COLOR` (other set)  → ON, bypassing the TTY check
 *   - otherwise                  → ON only when attached to a TTY
 */

export interface StyleEnv {
  NO_COLOR?: string;
  FORCE_COLOR?: string;
  MCPFOLD_NO_COLOR?: string;
  TERM?: string;
}

/** Decide whether ANSI color should be emitted, given the environment and a TTY flag. */
export function colorEnabled(env: StyleEnv, isTTY: boolean): boolean {
  const force = env.FORCE_COLOR;
  if (force === '0' || force === 'false') return false;
  // Explicit opt-outs win over everything except an explicit FORCE_COLOR=0 (handled above).
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return false;
  if (env.MCPFOLD_NO_COLOR === '1' || env.MCPFOLD_NO_COLOR === 'true') return false;
  if (env.TERM === 'dumb') return false;
  if (force !== undefined && force !== '') return true;
  return isTTY;
}

/** Semantic glyphs shared across command renderers so they stay visually consistent. */
export const symbols = {
  ok: '✓',
  err: '✖',
  warn: '⚠',
  info: 'ℹ',
  bullet: '•',
  arrow: '→',
  spark: '✨',
} as const;

const CODES = {
  reset: 0,
  bold: 1,
  dim: 2,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  gray: 90,
} as const;

type Colorize = (text: string) => string;

export interface Style {
  /** Whether this instance emits ANSI codes. */
  readonly enabled: boolean;
  bold: Colorize;
  dim: Colorize;
  red: Colorize;
  green: Colorize;
  yellow: Colorize;
  blue: Colorize;
  magenta: Colorize;
  cyan: Colorize;
  gray: Colorize;
}

/** Build a {@link Style}. When `enabled` is false every method is the identity function. */
export function createStyle(enabled: boolean): Style {
  const wrap = (code: number): Colorize =>
    enabled ? (text: string): string => `\x1b[${code}m${text}\x1b[${CODES.reset}m` : (t) => t;
  return {
    enabled,
    bold: wrap(CODES.bold),
    dim: wrap(CODES.dim),
    red: wrap(CODES.red),
    green: wrap(CODES.green),
    yellow: wrap(CODES.yellow),
    blue: wrap(CODES.blue),
    magenta: wrap(CODES.magenta),
    cyan: wrap(CODES.cyan),
    gray: wrap(CODES.gray),
  };
}

/**
 * The process-wide default, keyed off stdout's TTY state at import time. Command renderers import
 * this directly; under vitest / pipes / CI it is disabled, so `human` output is deterministic.
 */
export const style: Style = createStyle(
  colorEnabled(process.env as StyleEnv, Boolean(process.stdout.isTTY)),
);
