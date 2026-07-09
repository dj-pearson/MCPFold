import { describe, expect, it } from 'vitest';
import { rooCodeAdapter } from '../src/roo-code.js';
import { sampleServers } from './fixtures/servers.js';
import type { OsContext } from '../src/types.js';

const linux: OsContext = { platform: 'linux', home: '/home/dev', env: {} };
const mac: OsContext = { platform: 'darwin', home: '/Users/dev', env: {} };
const win: OsContext = { platform: 'win32', home: 'C:\\Users\\dev', env: {} };

describe('rooCodeAdapter (S19.1)', () => {
  it('has shim strategy and no restart', () => {
    expect(rooCodeAdapter.secretStrategy).toBe('shim');
    expect(rooCodeAdapter.needsRestart).toBe(false);
  });

  it('resolves the global storage file per OS', () => {
    expect(rooCodeAdapter.resolvePath('user', undefined, linux)).toBe(
      '/home/dev/.config/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/cline_mcp_settings.json',
    );
    expect(rooCodeAdapter.resolvePath('user', undefined, mac)).toBe(
      '/Users/dev/Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/cline_mcp_settings.json',
    );
    expect(rooCodeAdapter.resolvePath('user', undefined, win)).toBe(
      'C:\\Users\\dev\\AppData\\Roaming\\Code\\User\\globalStorage\\rooveterinaryinc.roo-cline\\settings\\cline_mcp_settings.json',
    );
  });

  it('resolves the project-scope .roo/mcp.json', () => {
    expect(rooCodeAdapter.resolvePath('project', '/repos/x', linux)).toBe('/repos/x/.roo/mcp.json');
  });

  it('project scope requires a project path', () => {
    expect(() => rooCodeAdapter.resolvePath('project', undefined, linux)).toThrow(/project path/);
  });

  it('renders the mcpServers shape and round-trips', () => {
    const file = rooCodeAdapter.render(sampleServers('roo-code'), linux);
    expect(file.contents).toContain('"mcpServers"');

    const parsed = rooCodeAdapter.parse(file.contents);
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
