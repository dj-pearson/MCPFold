import { describe, expect, it } from 'vitest';
import { copilotCliAdapter } from '../src/copilot-cli.js';
import { sampleServers } from './fixtures/servers.js';
import type { OsContext } from '../src/types.js';

const linux: OsContext = { platform: 'linux', home: '/home/dev', env: {} };
const win: OsContext = { platform: 'win32', home: 'C:\\Users\\dev', env: {} };

describe('copilotCliAdapter (S19.2)', () => {
  it('has shim strategy and no restart', () => {
    expect(copilotCliAdapter.secretStrategy).toBe('shim');
    expect(copilotCliAdapter.needsRestart).toBe(false);
  });

  it('resolves ~/.copilot/mcp-config.json, honoring COPILOT_HOME', () => {
    expect(copilotCliAdapter.resolvePath('user', undefined, linux)).toBe(
      '/home/dev/.copilot/mcp-config.json',
    );
    expect(copilotCliAdapter.resolvePath('user', undefined, win)).toBe(
      'C:\\Users\\dev\\.copilot\\mcp-config.json',
    );
    const custom: OsContext = { ...linux, env: { COPILOT_HOME: '/tmp/cp' } };
    expect(copilotCliAdapter.resolvePath('user', undefined, custom)).toBe(
      '/tmp/cp/mcp-config.json',
    );
  });

  it('renders mcpServers with explicit type (stdio/http) and round-trips', () => {
    const file = copilotCliAdapter.render(sampleServers('copilot-cli'), linux);
    const doc = JSON.parse(file.contents) as {
      mcpServers: { github: Record<string, unknown>; playwright: Record<string, unknown> };
    };
    expect(doc.mcpServers.playwright.type).toBe('stdio');
    expect(doc.mcpServers.playwright.command).toBe('npx');
    expect(doc.mcpServers.github.type).toBe('http');
    expect(doc.mcpServers.github.url).toBe('https://api.githubcopilot.com/mcp/');

    const parsed = copilotCliAdapter.parse(file.contents);
    expect(parsed.servers?.playwright?.command).toBe('npx');
    expect(parsed.servers?.github?.transport).toBe('streamable-http');
  });
});
