import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import type { ResolvedServer } from '@mcpfold/core';
import { gooseAdapter } from '../src/goose.js';
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
    client: 'goose',
    scope: 'user',
  },
];

describe('goose adapter (S19.2)', () => {
  it('resolves the config.yaml path per OS', () => {
    expect(gooseAdapter.resolvePath('user', undefined, linux)).toBe(
      '/home/dev/.config/goose/config.yaml',
    );
    expect(
      gooseAdapter.resolvePath('user', undefined, {
        platform: 'win32',
        home: 'C:\\Users\\dev',
        env: { APPDATA: 'C:\\Users\\dev\\AppData\\Roaming' },
      }),
    ).toContain('Block');
  });

  it('renders extensions with Goose field names and round-trips', () => {
    const { contents } = gooseAdapter.render(servers, linux);
    const doc = parseYaml(contents) as { extensions: Record<string, Record<string, unknown>> };
    expect(doc.extensions.playwright).toMatchObject({ type: 'stdio', cmd: 'npx', enabled: true });
    const parsed = gooseAdapter.parse(contents);
    expect(parsed.servers?.playwright).toEqual({
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest'],
      env: { HEADLESS: 'true' },
      tags: [],
    });
  });

  it('preserves unmanaged root keys + comments when writing into the shared config.yaml', () => {
    const existing = `# Goose config
GOOSE_PROVIDER: anthropic
GOOSE_MODEL: claude-sonnet-4
extensions:
  old_server:
    name: old_server
    type: stdio
    cmd: old
`;
    const { contents } = gooseAdapter.render(servers, linux, existing);
    // Non-MCP settings survive…
    expect(contents).toContain('GOOSE_PROVIDER: anthropic');
    expect(contents).toContain('GOOSE_MODEL: claude-sonnet-4');
    expect(contents).toContain('# Goose config'); // and the comment
    // …while `extensions` is fully replaced by the managed set.
    const doc = parseYaml(contents) as { extensions: Record<string, unknown> };
    expect(Object.keys(doc.extensions)).toEqual(['playwright']);
  });
});
