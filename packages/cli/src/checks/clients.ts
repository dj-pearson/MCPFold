import { existsSync, readFileSync } from 'node:fs';
import type { Config } from '@mcpfold/core';
import { requireAdapter, type OsContext } from '@mcpfold/adapters';
import type { Finding } from './types.js';

/**
 * On-disk client-file footguns (S3.7). The headline one: a VS Code MCP file that uses the
 * `mcpServers` root key (Claude's key) instead of VS Code's `servers` — the classic silent
 * failure. We check every profile's actual on-disk target.
 */
export function checkClientFiles(config: Config, ctx: OsContext): Finding[] {
  const findings: Finding[] = [];
  for (const [profileName, profile] of Object.entries(config.profiles)) {
    let path: string;
    try {
      path = requireAdapter(profile.client).resolvePath(profile.scope, profile.path, ctx);
    } catch {
      continue;
    }
    if (!existsSync(path)) continue;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    } catch {
      findings.push({
        severity: 'error',
        file: path,
        message: `Client file for profile "${profileName}" is not valid JSON.`,
        fix: 'Fix the JSON syntax or re-run `mcpfold sync` to regenerate it.',
      });
      continue;
    }

    if (profile.client === 'vscode' && 'mcpServers' in parsed && !('servers' in parsed)) {
      findings.push({
        severity: 'error',
        file: path,
        message: 'VS Code MCP file uses root key "mcpServers", but VS Code requires "servers".',
        fix: 'VS Code uses the root key "servers", not "mcpServers". Run `mcpfold sync` to rewrite it correctly.',
      });
    }
  }
  return findings;
}
