import { describe, expect, it } from 'vitest';
import { claudeDesktopAdapter } from '../src/claude-desktop.js';
import { sampleServers } from './fixtures/servers.js';
import type { OsContext } from '../src/types.js';

const mac: OsContext = { platform: 'darwin', home: '/Users/dev', env: {} };
const win: OsContext = { platform: 'win32', home: 'C:\\Users\\dev', env: {} };
const linux: OsContext = { platform: 'linux', home: '/home/dev', env: {} };

describe('claudeDesktopAdapter (S2.3)', () => {
  it('requires a restart to pick up changes', () => {
    expect(claudeDesktopAdapter.needsRestart).toBe(true);
    expect(claudeDesktopAdapter.render(sampleServers('claude-desktop'), mac).needsRestart).toBe(
      true,
    );
  });

  it('resolves claude_desktop_config.json per OS', () => {
    expect(claudeDesktopAdapter.resolvePath('user', undefined, mac)).toBe(
      '/Users/dev/Library/Application Support/Claude/claude_desktop_config.json',
    );
    expect(claudeDesktopAdapter.resolvePath('user', undefined, win)).toBe(
      'C:\\Users\\dev\\AppData\\Roaming\\Claude\\claude_desktop_config.json',
    );
    expect(claudeDesktopAdapter.resolvePath('user', undefined, linux)).toBe(
      '/home/dev/.config/Claude/claude_desktop_config.json',
    );
  });

  it('rejects project/workspace scope (user only)', () => {
    expect(() => claudeDesktopAdapter.resolvePath('project', '/x', mac)).toThrow(/user scope/);
  });

  it('renders golden and round-trips', async () => {
    const file = claudeDesktopAdapter.render(sampleServers('claude-desktop'), mac);
    await expect(file.contents).toMatchFileSnapshot('fixtures/claude-desktop/config.json');
    expect(claudeDesktopAdapter.parse(file.contents).servers?.playwright?.command).toBe('npx');
  });
});
