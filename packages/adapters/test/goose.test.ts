import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { gooseAdapter } from '../src/goose.js';
import { sampleServers } from './fixtures/servers.js';
import type { OsContext } from '../src/types.js';

const linux: OsContext = { platform: 'linux', home: '/home/dev', env: {} };
const mac: OsContext = { platform: 'darwin', home: '/Users/dev', env: {} };
const win: OsContext = { platform: 'win32', home: 'C:\\Users\\dev', env: {} };

describe('gooseAdapter (S19.2)', () => {
  it('has shim strategy and no restart', () => {
    expect(gooseAdapter.secretStrategy).toBe('shim');
    expect(gooseAdapter.needsRestart).toBe(false);
  });

  it('resolves config.yaml per OS', () => {
    expect(gooseAdapter.resolvePath('user', undefined, linux)).toBe(
      '/home/dev/.config/goose/config.yaml',
    );
    expect(gooseAdapter.resolvePath('user', undefined, mac)).toBe(
      '/Users/dev/.config/goose/config.yaml',
    );
    expect(gooseAdapter.resolvePath('user', undefined, win)).toBe(
      'C:\\Users\\dev\\AppData\\Roaming\\Block\\goose\\config\\config.yaml',
    );
    // User-scope only (S19.3): a project profile throws rather than misdirecting to the user file.
    expect(() => gooseAdapter.resolvePath('project', '/x', linux)).toThrow(/user scope/);
  });

  it('renders the extensions map with cmd/uri (not command/url) and round-trips', () => {
    const file = gooseAdapter.render(sampleServers('goose'), linux);
    const doc = YAML.parse(file.contents) as {
      extensions: { github: Record<string, unknown>; playwright: Record<string, unknown> };
    };
    expect(doc.extensions.playwright.type).toBe('stdio');
    expect(doc.extensions.playwright.cmd).toBe('npx');
    expect(doc.extensions.github.type).toBe('streamable_http');
    expect(doc.extensions.github.uri).toBe('https://api.githubcopilot.com/mcp/');

    const parsed = gooseAdapter.parse(file.contents);
    expect(parsed.servers?.playwright).toEqual({
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest'],
      env: { HEADLESS: 'true' },
      tags: [],
    });
    expect(parsed.servers?.github?.transport).toBe('streamable-http');
  });

  it('preserves non-MCP settings, comments, and builtin extensions when merging', () => {
    const existing = [
      '# my goose config',
      'GOOSE_PROVIDER: anthropic',
      'GOOSE_MODEL: claude',
      'extensions:',
      '  developer:',
      '    type: builtin',
      '    name: developer',
      '    enabled: true',
      '  stale_server:', // a previously-folded MCP server no longer in canonical
      '    type: stdio',
      '    cmd: old',
      '',
    ].join('\n');
    const file = gooseAdapter.render(sampleServers('goose'), linux, existing);

    // Non-MCP top-level keys survive.
    expect(file.contents).toContain('GOOSE_PROVIDER: anthropic');
    expect(file.contents).toContain('GOOSE_MODEL: claude');
    // A top-level comment survives.
    expect(file.contents).toContain('# my goose config');

    const doc = YAML.parse(file.contents) as { extensions: Record<string, unknown> };
    // Goose's own builtin extension is kept; the stale managed server is dropped; ours are present.
    expect(doc.extensions.developer).toBeDefined();
    expect(doc.extensions.stale_server).toBeUndefined();
    expect(doc.extensions.playwright).toBeDefined();
    expect(doc.extensions.github).toBeDefined();
  });

  it('re-folding its own output is idempotent', () => {
    const first = gooseAdapter.render(sampleServers('goose'), linux).contents;
    const second = gooseAdapter.render(sampleServers('goose'), linux, first).contents;
    expect(second).toBe(first);
  });
});
