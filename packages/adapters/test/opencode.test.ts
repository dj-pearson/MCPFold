import { describe, expect, it } from 'vitest';
import { opencodeAdapter } from '../src/opencode.js';
import { sampleServers } from './fixtures/servers.js';
import type { OsContext } from '../src/types.js';

const linux: OsContext = { platform: 'linux', home: '/home/dev', env: {} };
const win: OsContext = { platform: 'win32', home: 'C:\\Users\\dev', env: {} };

describe('opencodeAdapter (S19.2)', () => {
  it('has shim strategy and no restart', () => {
    expect(opencodeAdapter.secretStrategy).toBe('shim');
    expect(opencodeAdapter.needsRestart).toBe(false);
  });

  it('resolves the XDG config path (even on Windows) and project file', () => {
    expect(opencodeAdapter.resolvePath('user', undefined, linux)).toBe(
      '/home/dev/.config/opencode/opencode.json',
    );
    // opencode uses XDG even on Windows.
    expect(opencodeAdapter.resolvePath('user', undefined, win)).toBe(
      'C:\\Users\\dev\\.config\\opencode\\opencode.json',
    );
    const xdg: OsContext = { ...linux, env: { XDG_CONFIG_HOME: '/cfg' } };
    expect(opencodeAdapter.resolvePath('user', undefined, xdg)).toBe('/cfg/opencode/opencode.json');
    expect(opencodeAdapter.resolvePath('project', '/repos/x', linux)).toBe(
      '/repos/x/opencode.json',
    );
  });

  it('project scope requires a project path', () => {
    expect(() => opencodeAdapter.resolvePath('project', undefined, linux)).toThrow(/project path/);
  });

  it('renders the mcp key with a command ARRAY + environment, and round-trips', () => {
    const file = opencodeAdapter.render(sampleServers('opencode'), linux);
    const doc = JSON.parse(file.contents) as {
      mcp: { github: Record<string, unknown>; playwright: Record<string, unknown> };
    };
    expect(doc.mcp.playwright.type).toBe('local');
    expect(doc.mcp.playwright.command).toEqual(['npx', '-y', '@playwright/mcp@latest']);
    expect(doc.mcp.playwright.environment).toEqual({ HEADLESS: 'true' });
    expect(doc.mcp.github.type).toBe('remote');
    expect(doc.mcp.github.url).toBe('https://api.githubcopilot.com/mcp/');

    const parsed = opencodeAdapter.parse(file.contents);
    expect(parsed.servers?.playwright).toEqual({
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest'],
      env: { HEADLESS: 'true' },
      tags: [],
    });
    expect(parsed.servers?.github?.transport).toBe('streamable-http');
  });

  it('preserves other top-level keys and comments when merging', () => {
    const existing = [
      '{',
      '  // pick a model',
      '  "model": "anthropic/claude",',
      '  "theme": "dark"',
      '}',
      '',
    ].join('\n');
    const file = opencodeAdapter.render(sampleServers('opencode'), linux, existing);
    expect(file.contents).toContain('// pick a model');
    expect(file.contents).toContain('"model": "anthropic/claude"');
    expect(file.contents).toContain('"theme": "dark"');
    const doc = JSON.parse(
      // strip the line comment so JSON.parse accepts it
      file.contents.replace(/^\s*\/\/.*$/gm, ''),
    ) as { model: string; mcp: Record<string, unknown> };
    expect(doc.model).toBe('anthropic/claude');
    expect(doc.mcp.playwright).toBeDefined();
  });

  it('re-folding its own output is idempotent', () => {
    const first = opencodeAdapter.render(sampleServers('opencode'), linux).contents;
    const second = opencodeAdapter.render(sampleServers('opencode'), linux, first).contents;
    expect(second).toBe(first);
  });
});
