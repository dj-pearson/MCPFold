import { describe, expect, it } from 'vitest';
import { jetbrainsAdapter } from '../src/jetbrains.js';
import { sampleServers } from './fixtures/servers.js';
import type { OsContext } from '../src/types.js';

const linux: OsContext = { platform: 'linux', home: '/home/dev', env: {} };
const mac: OsContext = { platform: 'darwin', home: '/Users/dev', env: {} };
const win: OsContext = { platform: 'win32', home: 'C:\\Users\\dev', env: {} };

describe('jetbrainsAdapter (S19.1)', () => {
  it('has shim strategy and no restart', () => {
    expect(jetbrainsAdapter.secretStrategy).toBe('shim');
    expect(jetbrainsAdapter.needsRestart).toBe(false);
  });

  it('resolves user + project paths per OS (JetBrains/Junie mcp.json)', () => {
    expect(jetbrainsAdapter.resolvePath('user', undefined, linux)).toBe(
      '/home/dev/.junie/mcp/mcp.json',
    );
    expect(jetbrainsAdapter.resolvePath('user', undefined, mac)).toBe(
      '/Users/dev/.junie/mcp/mcp.json',
    );
    expect(jetbrainsAdapter.resolvePath('user', undefined, win)).toBe(
      'C:\\Users\\dev\\.junie\\mcp\\mcp.json',
    );
    expect(jetbrainsAdapter.resolvePath('project', '/repos/x', linux)).toBe(
      '/repos/x/.junie/mcp/mcp.json',
    );
  });

  it('project scope requires a project path', () => {
    expect(() => jetbrainsAdapter.resolvePath('project', undefined, linux)).toThrow(/project path/);
  });

  it('renders the mcpServers shape and parses back losslessly', () => {
    const file = jetbrainsAdapter.render(sampleServers('jetbrains'), linux);
    expect(file.contents).toContain('"mcpServers"');
    expect(file.needsRestart).toBe(false);

    const parsed = jetbrainsAdapter.parse(file.contents);
    expect(parsed.servers?.playwright).toEqual({
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest'],
      env: { HEADLESS: 'true' },
      tags: [],
    });
    expect(parsed.servers?.github?.transport).toBe('http');
    expect(typeof parsed.servers?.github?.url).toBe('string');
  });
});
