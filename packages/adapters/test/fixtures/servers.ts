import type { ClientId, ResolvedServer, Scope } from '@mcpfold/core';

/**
 * A shared set of resolved servers used across adapter fixture tests: one authenticated
 * remote (bearer token) and one stdio server. `render` ignores `client`, so tests pass the
 * client under test for clarity.
 */
export function sampleServers(client: ClientId, scope: Scope = 'user', projectPath?: string): ResolvedServer[] {
  return [
    {
      name: 'github',
      transport: 'http',
      url: 'https://api.githubcopilot.com/mcp/',
      auth: { type: 'bearer', token: '${infisical:dev/mcp/GITHUB_PAT}' },
      tags: ['work'],
      client,
      scope,
      projectPath,
    },
    {
      name: 'playwright',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest'],
      env: { HEADLESS: 'true' },
      tags: ['code'],
      client,
      scope,
      projectPath,
    },
  ];
}
