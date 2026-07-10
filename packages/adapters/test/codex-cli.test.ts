import { describe, expect, it } from 'vitest';
import { parse as parseToml } from 'smol-toml';
import type { ResolvedServer } from '@mcpfold/core';
import { codexCliAdapter } from '../src/codex-cli.js';
import type { OsContext } from '../src/types.js';

const linux: OsContext = { platform: 'linux', home: '/home/dev', env: {} };

const servers: ResolvedServer[] = [
  {
    name: 'playwright',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@playwright/mcp@latest'],
    env: { HEADLESS: 'true' },
    tags: [],
    client: 'codex-cli',
    scope: 'user',
  },
];

describe('codex-cli adapter (S19.2)', () => {
  it('resolves ~/.codex/config.toml and honors CODEX_HOME', () => {
    expect(codexCliAdapter.resolvePath('user', undefined, linux)).toBe(
      '/home/dev/.codex/config.toml',
    );
    expect(
      codexCliAdapter.resolvePath('user', undefined, {
        ...linux,
        env: { CODEX_HOME: '/custom/codex' },
      }),
    ).toBe('/custom/codex/config.toml');
  });

  it('renders [mcp_servers.*] snake_case tables and round-trips', () => {
    const { contents } = codexCliAdapter.render(servers, linux);
    expect(contents).toContain('[mcp_servers.playwright]');
    const doc = parseToml(contents) as { mcp_servers: Record<string, unknown> };
    expect(doc.mcp_servers.playwright).toMatchObject({ command: 'npx' });
    const parsed = codexCliAdapter.parse(contents);
    expect(parsed.servers?.playwright).toEqual({
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest'],
      env: { HEADLESS: 'true' },
      tags: [],
    });
  });

  it('preserves unmanaged tables when writing into the shared config.toml', () => {
    const existing = `model = "gpt-5-codex"
approval_policy = "on-request"

[tui]
theme = "dark"

[mcp_servers.old]
command = "old"
`;
    const { contents } = codexCliAdapter.render(servers, linux, existing);
    const doc = parseToml(contents) as Record<string, unknown>;
    // Non-MCP config survives…
    expect(doc.model).toBe('gpt-5-codex');
    expect(doc.approval_policy).toBe('on-request');
    expect((doc.tui as Record<string, unknown>).theme).toBe('dark');
    // …while mcp_servers is fully replaced.
    expect(Object.keys(doc.mcp_servers as Record<string, unknown>)).toEqual(['playwright']);
  });
});
