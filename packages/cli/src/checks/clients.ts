import { existsSync, readFileSync } from 'node:fs';
import {
  findMcpRemoteArg,
  isVulnerableMcpRemoteVersion,
  MCP_REMOTE_PINNED_VERSION,
  type Config,
} from '@mcpfold/core';
import { requireAdapter, type OsContext } from '@mcpfold/adapters';
import type { Finding, FixAction } from './types.js';

/**
 * Scan a parsed client config for `mcp-remote` bridge invocations pinned to an unpinned or
 * known-vulnerable version (CVE-2025-6514). Client configs put server entries under `mcpServers`
 * (most) or `servers` (VS Code); each may launch `npx -y mcp-remote[@version] <url>`.
 */
function checkMcpRemotePins(
  parsed: Record<string, unknown>,
  path: string,
  profile: string,
  client: string,
): Finding[] {
  const findings: Finding[] = [];
  for (const root of [parsed.mcpServers, parsed.servers]) {
    if (!root || typeof root !== 'object') continue;
    for (const [name, value] of Object.entries(root as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const args = (value as { args?: unknown }).args;
      if (!Array.isArray(args)) continue;
      const ref = findMcpRemoteArg(args as string[]);
      if (!ref || !isVulnerableMcpRemoteVersion(ref.version)) continue;
      findings.push({
        severity: 'warning',
        file: path,
        where: `mcpServers.${name}`,
        message: ref.version
          ? `Server "${name}" bridges through mcp-remote@${ref.version}, at or below the CVE-2025-6514 vulnerable range (0.0.5–0.1.15).`
          : `Server "${name}" launches an unpinned "mcp-remote" (CVE-2025-6514: RCE in 0.0.5–0.1.15).`,
        fix: `Pin the bridge to a safe version — run \`mcpfold sync\` to rewrite it to mcp-remote@${MCP_REMOTE_PINNED_VERSION}.`,
        autofix: { kind: 'resync-client', profile, client, path },
      });
    }
  }
  return findings;
}

/**
 * On-disk client-file footguns (S3.7). The headline one: a VS Code MCP file that uses the
 * `mcpServers` root key (Claude's key) instead of VS Code's `servers` — the classic silent
 * failure. We check every profile's actual on-disk target. Also flags unpinned/vulnerable
 * mcp-remote bridges (S17.1, CVE-2025-6514).
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

    const resync: FixAction = {
      kind: 'resync-client',
      profile: profileName,
      client: profile.client,
      path,
    };

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    } catch {
      findings.push({
        severity: 'error',
        file: path,
        message: `Client file for profile "${profileName}" is not valid JSON.`,
        fix: 'Fix the JSON syntax or re-run `mcpfold sync` to regenerate it.',
        autofix: resync,
      });
      continue;
    }

    if (profile.client === 'vscode' && 'mcpServers' in parsed && !('servers' in parsed)) {
      findings.push({
        severity: 'error',
        file: path,
        message: 'VS Code MCP file uses root key "mcpServers", but VS Code requires "servers".',
        fix: 'VS Code uses the root key "servers", not "mcpServers". Run `mcpfold sync` to rewrite it correctly.',
        autofix: resync,
      });
    }

    findings.push(...checkMcpRemotePins(parsed, path, profileName, profile.client));
  }
  return findings;
}
