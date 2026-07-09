import { describe, expect, it } from 'vitest';
import { lmStudioAdapter } from '../src/lm-studio.js';
import { sampleServers } from './fixtures/servers.js';
import type { OsContext } from '../src/types.js';

const linux: OsContext = { platform: 'linux', home: '/home/dev', env: {} };
const mac: OsContext = { platform: 'darwin', home: '/Users/dev', env: {} };
const win: OsContext = { platform: 'win32', home: 'C:\\Users\\dev', env: {} };

describe('lmStudioAdapter (S19.2)', () => {
  it('has shim strategy and no restart', () => {
    expect(lmStudioAdapter.secretStrategy).toBe('shim');
    expect(lmStudioAdapter.needsRestart).toBe(false);
  });

  it('resolves ~/.lmstudio/mcp.json (home-relative on every OS)', () => {
    expect(lmStudioAdapter.resolvePath('user', undefined, linux)).toBe(
      '/home/dev/.lmstudio/mcp.json',
    );
    expect(lmStudioAdapter.resolvePath('user', undefined, mac)).toBe(
      '/Users/dev/.lmstudio/mcp.json',
    );
    expect(lmStudioAdapter.resolvePath('user', undefined, win)).toBe(
      'C:\\Users\\dev\\.lmstudio\\mcp.json',
    );
  });

  it('renders Cursor-compatible mcpServers (no type field) and round-trips', () => {
    const file = lmStudioAdapter.render(sampleServers('lm-studio'), linux);
    const doc = JSON.parse(file.contents) as {
      mcpServers: { github: Record<string, unknown>; playwright: Record<string, unknown> };
    };
    expect(doc.mcpServers.playwright.command).toBe('npx');
    expect(doc.mcpServers.playwright.type).toBeUndefined(); // Cursor notation: no explicit type
    expect(doc.mcpServers.github.url).toBe('https://api.githubcopilot.com/mcp/');

    const parsed = lmStudioAdapter.parse(file.contents);
    expect(parsed.servers?.playwright?.command).toBe('npx');
    expect(parsed.servers?.github?.transport).toBe('streamable-http');
  });
});
