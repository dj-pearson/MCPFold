import { describe, expect, it } from 'vitest';
import { vscodeAdapter } from '../src/vscode.js';
import { sampleServers } from './fixtures/servers.js';
import type { OsContext } from '../src/types.js';

const linux: OsContext = { platform: 'linux', home: '/home/dev', env: {} };

describe('vscodeAdapter (S2.5)', () => {
  it('uses root key `servers`, NOT `mcpServers` (the silent-failure trap)', () => {
    const file = vscodeAdapter.render(sampleServers('vscode'), linux);
    const parsed = JSON.parse(file.contents) as Record<string, unknown>;
    expect('servers' in parsed).toBe(true);
    expect('mcpServers' in parsed).toBe(false);
  });

  it('converts a bearer token into an ${input:} header + inputs entry', async () => {
    const file = vscodeAdapter.render(sampleServers('vscode'), linux);
    const parsed = JSON.parse(file.contents) as {
      servers: Record<string, { headers?: Record<string, string> }>;
      inputs: { id: string; type: string; password: boolean }[];
    };
    expect(parsed.servers.github?.headers?.Authorization).toBe('Bearer ${input:github-token}');
    expect(parsed.inputs).toContainEqual({
      id: 'github-token',
      type: 'promptString',
      description: 'Token for github',
      password: true,
    });
    await expect(file.contents).toMatchFileSnapshot('fixtures/vscode/mcp.json');
  });

  it('resolves workspace and user paths', () => {
    expect(vscodeAdapter.resolvePath('workspace', '/repos/x', linux)).toBe(
      '/repos/x/.vscode/mcp.json',
    );
    expect(vscodeAdapter.resolvePath('user', undefined, linux)).toBe(
      '/home/dev/.config/Code/User/mcp.json',
    );
  });

  it('parses the `servers` key back to canonical (stdio round-trips)', () => {
    const file = vscodeAdapter.render(sampleServers('vscode'), linux);
    const parsed = vscodeAdapter.parse(file.contents);
    expect(parsed.servers?.playwright).toEqual({
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest'],
      env: { HEADLESS: 'true' },
      tags: [],
    });
    expect(parsed.servers?.github?.transport).toBe('streamable-http');
  });

  // S22.2 (BLOCKER): mcp.json can carry other top-level keys and comments; merge, don't overwrite.
  it('merges into mcp.json — preserves unrelated top-level keys and comments', () => {
    const existing = [
      '{',
      '  // vs code mcp',
      '  "$schema": "https://example.test/mcp.schema.json",',
      '  "custom": { "keep": true },',
      '  "servers": { "stale": { "type": "stdio", "command": "old" } }',
      '}',
      '',
    ].join('\n');
    const file = vscodeAdapter.render(sampleServers('vscode'), linux, existing);
    expect(file.contents).toContain('// vs code mcp');
    const doc = JSON.parse(file.contents.replace(/^\s*\/\/.*$/gm, '')) as {
      $schema: string;
      custom: { keep: boolean };
      servers: Record<string, unknown>;
      inputs: unknown[];
    };
    expect(doc.$schema).toBe('https://example.test/mcp.schema.json');
    expect(doc.custom).toEqual({ keep: true });
    expect(Object.keys(doc.servers).sort()).toEqual(['github', 'playwright']);
    expect(doc.servers.stale).toBeUndefined();
    // The bearer github server contributes a prompted input.
    expect(Array.isArray(doc.inputs)).toBe(true);
  });
});
