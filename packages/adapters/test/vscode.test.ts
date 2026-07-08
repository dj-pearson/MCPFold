import { describe, expect, it } from 'vitest';
import { vscodeAdapter } from '../src/vscode.js';
import { sampleServers } from './fixtures/servers.js';
import type { OsContext } from '../src/types.js';

const linux: OsContext = { platform: 'linux', home: '/home/dev', env: {} };

describe('vscodeAdapter (S2.5)', () => {
  it('uses root key `servers`, NOT `mcpServers` (the silent-failure trap)', () => {
    const file = vscodeAdapter.render(sampleServers('vscode'), linux);
    const parsed = JSON.parse(file.contents) as Record<string, unknown>;
    expect('servers' in parsed).toBe(true);
    expect('mcpServers' in parsed).toBe(false);
  });

  it('converts a bearer token into an ${input:} header + inputs entry', async () => {
    const file = vscodeAdapter.render(sampleServers('vscode'), linux);
    const parsed = JSON.parse(file.contents) as {
      servers: Record<string, { headers?: Record<string, string> }>;
      inputs: { id: string; type: string; password: boolean }[];
    };
    expect(parsed.servers.github?.headers?.Authorization).toBe('Bearer ${input:github-token}');
    expect(parsed.inputs).toContainEqual({
      id: 'github-token',
      type: 'promptString',
      description: 'Token for github',
      password: true,
    });
    await expect(file.contents).toMatchFileSnapshot('fixtures/vscode/mcp.json');
  });

  it('resolves workspace and user paths', () => {
    expect(vscodeAdapter.resolvePath('workspace', '/repos/x', linux)).toBe(
      '/repos/x/.vscode/mcp.json',
    );
    expect(vscodeAdapter.resolvePath('user', undefined, linux)).toBe(
      '/home/dev/.config/Code/User/mcp.json',
    );
  });

  it('parses the `servers` key back to canonical (stdio round-trips)', () => {
    const file = vscodeAdapter.render(sampleServers('vscode'), linux);
    const parsed = vscodeAdapter.parse(file.contents);
    expect(parsed.servers?.playwright).toEqual({
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest'],
      env: { HEADLESS: 'true' },
      tags: [],
    });
    expect(parsed.servers?.github?.transport).toBe('http');
  });
});
