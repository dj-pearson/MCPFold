import { describe, expect, it } from 'vitest';
import { continueAdapter } from '../src/continue.js';
import { sampleServers } from './fixtures/servers.js';
import type { OsContext } from '../src/types.js';

const linux: OsContext = { platform: 'linux', home: '/home/dev', env: {} };
const win: OsContext = { platform: 'win32', home: 'C:\\Users\\dev', env: {} };

describe('continueAdapter (S19.1)', () => {
  it('has shim strategy and no restart', () => {
    expect(continueAdapter.secretStrategy).toBe('shim');
    expect(continueAdapter.needsRestart).toBe(false);
  });

  it('resolves user + project paths into .continue/mcpServers per OS', () => {
    expect(continueAdapter.resolvePath('user', undefined, linux)).toBe(
      '/home/dev/.continue/mcpServers/mcpfold.json',
    );
    expect(continueAdapter.resolvePath('user', undefined, win)).toBe(
      'C:\\Users\\dev\\.continue\\mcpServers\\mcpfold.json',
    );
    expect(continueAdapter.resolvePath('project', '/repos/x', linux)).toBe(
      '/repos/x/.continue/mcpServers/mcpfold.json',
    );
  });

  it('project scope requires a project path', () => {
    expect(() => continueAdapter.resolvePath('project', undefined, linux)).toThrow(/project path/);
  });

  it('renders an mcpServers JSON Continue auto-loads, and round-trips', () => {
    const file = continueAdapter.render(sampleServers('continue'), linux);
    expect(file.contents).toContain('"mcpServers"');

    const parsed = continueAdapter.parse(file.contents);
    expect(parsed.servers?.playwright).toEqual({
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest'],
      env: { HEADLESS: 'true' },
      tags: [],
    });
    expect(parsed.servers?.github?.transport).toBe('streamable-http');
  });
});
