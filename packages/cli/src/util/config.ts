import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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

export interface LoadedConfig {
  path: string;
  config: Config;
}

/** Load + validate the config in `cwd`, throwing coded errors the CLI turns into output. */
export function loadConfigFromDisk(cwd: string): LoadedConfig {
  const path = findConfigPath(cwd);
  if (!path) {
    throw new UsageError(`No ${CONFIG_FILENAMES[0]} found in ${cwd}.`, {
      hint: 'Run `mcpfold init` to scaffold one, or pass --cwd to point at your config.',
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
