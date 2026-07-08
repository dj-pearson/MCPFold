import { describe, expect, it } from 'vitest';
import { windsurfAdapter } from '../src/windsurf.js';
import { sampleServers } from './fixtures/servers.js';
import type { OsContext } from '../src/types.js';

const linux: OsContext = { platform: 'linux', home: '/home/dev', env: {} };

describe('windsurfAdapter (S2.6)', () => {
  it('requires a restart', () => {
    expect(windsurfAdapter.needsRestart).toBe(true);
  });

  it('rewrites an authed remote to an mcp-remote stdio invocation; leaves stdio alone', async () => {
    const file = windsurfAdapter.render(sampleServers('windsurf'), linux);
    const parsed = JSON.parse(file.contents) as {
      mcpServers: Record<string, { command?: string; args?: string[] }>;
    };
    // github (http + bearer) → npx mcp-remote wrapper with an Authorization header arg.
    expect(parsed.mcpServers.github?.command).toBe('npx');
    expect(parsed.mcpServers.github?.args).toEqual([
      '-y',
      'mcp-remote',
      'https://api.githubcopilot.com/mcp/',
      '--header',
      'Authorization: Bearer ${infisical:dev/mcp/GITHUB_PAT}',
    ]);
    // playwright (plain stdio) renders normally.
    expect(parsed.mcpServers.playwright?.command).toBe('npx');
    expect(parsed.mcpServers.playwright?.args).toEqual(['-y', '@playwright/mcp@latest']);
    await expect(file.contents).toMatchFileSnapshot('fixtures/windsurf/mcp_config.json');
  });

  it('parse reverses an mcp-remote wrapper back to a canonical http server', () => {
    const file = windsurfAdapter.render(sampleServers('windsurf'), linux);
    const parsed = windsurfAdapter.parse(file.contents);
    expect(parsed.servers?.github).toEqual({
      transport: 'http',
      url: 'https://api.githubcopilot.com/mcp/',
      auth: {
        type: 'header',
        headers: { Authorization: 'Bearer ${infisical:dev/mcp/GITHUB_PAT}' },
      },
      tags: [],
    });
    expect(parsed.servers?.playwright?.transport).toBe('stdio');
  });
});
