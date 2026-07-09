import { describe, expect, it } from 'vitest';
import { warpAdapter } from '../src/warp.js';
import { sampleServers } from './fixtures/servers.js';
import type { OsContext } from '../src/types.js';

const linux: OsContext = { platform: 'linux', home: '/home/dev', env: {} };
const win: OsContext = { platform: 'win32', home: 'C:\\Users\\dev', env: {} };

describe('warpAdapter (S19.2)', () => {
  it('has shim strategy and no restart', () => {
    expect(warpAdapter.secretStrategy).toBe('shim');
    expect(warpAdapter.needsRestart).toBe(false);
  });

  it('resolves the user and project .warp/.mcp.json', () => {
    expect(warpAdapter.resolvePath('user', undefined, linux)).toBe('/home/dev/.warp/.mcp.json');
    expect(warpAdapter.resolvePath('user', undefined, win)).toBe(
      'C:\\Users\\dev\\.warp\\.mcp.json',
    );
    expect(warpAdapter.resolvePath('project', '/repos/x', linux)).toBe('/repos/x/.warp/.mcp.json');
  });

  it('project scope requires a project path', () => {
    expect(() => warpAdapter.resolvePath('project', undefined, linux)).toThrow(/project path/);
  });

  it('renders the mcpServers shape and round-trips', () => {
    const file = warpAdapter.render(sampleServers('warp'), linux);
    expect(file.contents).toContain('"mcpServers"');
    const parsed = warpAdapter.parse(file.contents);
    expect(parsed.servers?.playwright?.command).toBe('npx');
    expect(parsed.servers?.github?.transport).toBe('streamable-http');
  });
});
