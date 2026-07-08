import { describe, expect, it } from 'vitest';
import { cursorAdapter } from '../src/cursor.js';
import { sampleServers } from './fixtures/servers.js';
import type { OsContext } from '../src/types.js';

const linux: OsContext = { platform: 'linux', home: '/home/dev', env: {} };
const win: OsContext = { platform: 'win32', home: 'C:\\Users\\dev', env: {} };

describe('cursorAdapter (S2.2)', () => {
  it('has shim strategy and no restart', () => {
    expect(cursorAdapter.secretStrategy).toBe('shim');
    expect(cursorAdapter.needsRestart).toBe(false);
  });

  it('resolves user + project paths per OS', () => {
    expect(cursorAdapter.resolvePath('user', undefined, linux)).toBe('/home/dev/.cursor/mcp.json');
    expect(cursorAdapter.resolvePath('project', '/repos/x', linux)).toBe(
      '/repos/x/.cursor/mcp.json',
    );
    expect(cursorAdapter.resolvePath('user', undefined, win)).toBe(
      'C:\\Users\\dev\\.cursor\\mcp.json',
    );
  });

  it('renders mcpServers golden and parses back losslessly', async () => {
    const file = cursorAdapter.render(sampleServers('cursor'), linux);
    expect(file.contents).toContain('"mcpServers"');
    await expect(file.contents).toMatchFileSnapshot('fixtures/cursor/mcp.json');

    const parsed = cursorAdapter.parse(file.contents);
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
