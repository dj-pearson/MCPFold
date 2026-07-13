import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ConfigValidationError, loadConfig, UsageError, type Config } from '@mcpfold/core';

/**
 * Locate and load the canonical config from disk. The canonical filename is neutral and
 * un-branded (`mcp.config.jsonc`) so it can become a de-facto standard; a `.json` variant
 * is also accepted.
 */
export const CONFIG_FILENAMES = ['mcp.config.jsonc', 'mcp.config.json'] as const;

/**
 * The flat ecosystem-standard file (Claude Code's project target; one of Visual Studio's read
 * paths). mcpfold treats it as a first-class import source / export target, never as canonical —
 * see docs/adr/mcp-json-interop.md.
 */
export const MCP_JSON_FILENAME = '.mcp.json';

export function findConfigPath(cwd: string): string | null {
  for (const name of CONFIG_FILENAMES) {
    const candidate = join(cwd, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** The directories an upward search from `startDir` visits, nearest first up to the fs root. */
export function upwardSearchDirs(startDir: string): string[] {
  const dirs: string[] = [];
  let dir = startDir;
  // dirname('/') === '/' and dirname('C:\\') === 'C:\\' — the fixed point marks the root.
  for (;;) {
    dirs.push(dir);
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dirs;
}

/**
 * Walk up from `startDir` to the filesystem root, returning the NEAREST canonical config. GUI
 * clients (Claude Desktop et al.) launch `mcpfold run` from an arbitrary cwd; sync embeds
 * `--cwd <configDir>` so the exact directory is searched first, but a pre-existing bare shim
 * (no `--cwd`) still resolves by walking up from wherever the client happened to launch it.
 */
export function findConfigPathUpward(startDir: string): string | null {
  for (const dir of upwardSearchDirs(startDir)) {
    const found = findConfigPath(dir);
    if (found) return found;
  }
  return null;
}

export interface LoadedConfig {
  path: string;
  config: Config;
}

export interface LoadConfigOptions {
  /**
   * Walk up from `cwd` to the filesystem root, using the nearest config found. Used by
   * `mcpfold run` so a folded shim launched from an arbitrary cwd (GUI clients) still resolves
   * the canonical config even without an embedded `--cwd`. Off by default: other commands act on
   * the config in the current directory only.
   */
  upward?: boolean;
}

/** Load + validate the config in `cwd`, throwing coded errors the CLI turns into output. */
export function loadConfigFromDisk(cwd: string, opts: LoadConfigOptions = {}): LoadedConfig {
  const path = opts.upward ? findConfigPathUpward(cwd) : findConfigPath(cwd);
  if (!path) {
    const searched = opts.upward
      ? `Searched: ${upwardSearchDirs(cwd).join(', ')}.`
      : `Searched: ${cwd}.`;
    throw new UsageError(`No ${CONFIG_FILENAMES[0]} found. ${searched}`, {
      hint: 'Run `mcpfold init` to scaffold one, or pass --cwd to point at your config directory.',
    });
  }
  const result = loadConfig(readFileSync(path, 'utf8'));
  if (!result.ok) {
    const first = result.errors[0];
    throw new ConfigValidationError(
      `Invalid config at ${path}: ${first?.message ?? 'unknown error'}`,
      { hint: first?.hint },
    );
  }
  return { path, config: result.config };
}
