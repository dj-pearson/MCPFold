import { describe, expect, it } from 'vitest';
import type { ResolvedServer } from '@mcpfold/core';
import {
  createMcpServersAdapter,
  fromMcpServersShape,
  toMcpEntry,
  toMcpServersShape,
} from '../src/shared.js';

const stdioServer: ResolvedServer = {
  name: 'playwright',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@playwright/mcp@latest'],
  env: { HEADLESS: 'true' },
  tags: ['code'],
  client: 'cursor',
  scope: 'user',
};

const httpServer: ResolvedServer = {
  name: 'github',
  transport: 'http',
  url: 'https://api.githubcopilot.com/mcp/',
  auth: { type: 'header', headers: { 'X-Extra': 'v' } },
  tags: ['work'],
  client: 'cursor',
  scope: 'user',
};

describe('toMcpEntry (S2.1)', () => {
  it('maps a stdio server to command/args/env', () => {
    expect(toMcpEntry(stdioServer)).toEqual({
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest'],
      env: { HEADLESS: 'true' },
    });
  });
  it('maps a remote server to url (+ headers)', () => {
    expect(toMcpEntry(httpServer)).toEqual({
      url: 'https://api.githubcopilot.com/mcp/',
      headers: { 'X-Extra': 'v' },
    });
  });
  it('includes an explicit type when requested (Claude Code)', () => {
    expect(toMcpEntry(stdioServer, { includeType: true })).toMatchObject({ type: 'stdio' });
    expect(toMcpEntry(httpServer, { includeType: true })).toMatchObject({ type: 'http' });
  });
});

describe('mcpServers shape round-trip (S2.1)', () => {
  it('toMcpServersShape → fromMcpServersShape recovers structural fields', () => {
    const shape = toMcpServersShape([stdioServer, httpServer]);
    const back = fromMcpServersShape(shape);
    expect(back.servers?.playwright).toEqual({
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest'],
      env: { HEADLESS: 'true' },
      tags: [],
    });
    expect(back.servers?.github).toEqual({
      transport: 'http',
      url: 'https://api.githubcopilot.com/mcp/',
      auth: { type: 'header', headers: { 'X-Extra': 'v' } },
      tags: [],
    });
  });

  it('ignores malformed entries without throwing', () => {
    expect(fromMcpServersShape({ bad: 42, ok: { command: 'x' } }).servers).toEqual({
      ok: { transport: 'stdio', command: 'x', tags: [] },
    });
    expect(fromMcpServersShape(null).servers).toEqual({});
  });
});

describe('createMcpServersAdapter (S2.1)', () => {
  const adapter = createMcpServersAdapter({
    id: 'cursor',
    resolvePath: (scope, projectPath) =>
      scope === 'user' ? '/home/dev/.cursor/mcp.json' : `${projectPath}/.cursor/mcp.json`,
  });

  it('renders deterministic mcpServers JSON with a trailing newline', () => {
    const file = adapter.render([httpServer, stdioServer]);
    expect(file.path).toBe('/home/dev/.cursor/mcp.json');
    expect(file.needsRestart).toBe(false);
    expect(file.contents.endsWith('\n')).toBe(true);
    // Keys sorted deterministically (github before playwright, mcpServers root).
    expect(file.contents).toBe(
      [
        '{',
        '  "mcpServers": {',
        '    "github": {',
        '      "headers": {',
        '        "X-Extra": "v"',
        '      },',
        '      "url": "https://api.githubcopilot.com/mcp/"',
        '    },',
        '    "playwright": {',
        '      "args": [',
        '        "-y",',
        '        "@playwright/mcp@latest"',
        '      ],',
        '      "command": "npx",',
        '      "env": {',
        '        "HEADLESS": "true"',
        '      }',
        '    }',
        '  }',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('parse() inverts render() through the root key', () => {
    const file = adapter.render([stdioServer]);
    const parsed = adapter.parse(file.contents);
    expect(parsed.servers?.playwright?.command).toBe('npx');
  });
});
