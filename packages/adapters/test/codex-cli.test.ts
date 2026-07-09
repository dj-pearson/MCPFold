import { describe, expect, it } from 'vitest';
import { parse as parseToml } from 'smol-toml';
import { codexCliAdapter } from '../src/codex-cli.js';
import { sampleServers } from './fixtures/servers.js';
import type { OsContext } from '../src/types.js';

const linux: OsContext = { platform: 'linux', home: '/home/dev', env: {} };
const win: OsContext = { platform: 'win32', home: 'C:\\Users\\dev', env: {} };

describe('codexCliAdapter (S19.2)', () => {
  it('has shim strategy and no restart', () => {
    expect(codexCliAdapter.secretStrategy).toBe('shim');
    expect(codexCliAdapter.needsRestart).toBe(false);
  });

  it('resolves ~/.codex/config.toml, honoring CODEX_HOME', () => {
    expect(codexCliAdapter.resolvePath('user', undefined, linux)).toBe(
      '/home/dev/.codex/config.toml',
    );
    expect(codexCliAdapter.resolvePath('user', undefined, win)).toBe(
      'C:\\Users\\dev\\.codex\\config.toml',
    );
    const custom: OsContext = { ...linux, env: { CODEX_HOME: '/tmp/cx' } };
    expect(codexCliAdapter.resolvePath('user', undefined, custom)).toBe('/tmp/cx/config.toml');
  });

  it('renders [mcp_servers.*] tables and round-trips', () => {
    const file = codexCliAdapter.render(sampleServers('codex-cli'), linux);
    const doc = parseToml(file.contents) as {
      mcp_servers: { github: Record<string, unknown>; playwright: Record<string, unknown> };
    };
    expect(doc.mcp_servers.playwright.command).toBe('npx');
    expect(doc.mcp_servers.playwright.args).toEqual(['-y', '@playwright/mcp@latest']);
    expect(doc.mcp_servers.github.url).toBe('https://api.githubcopilot.com/mcp/');

    const parsed = codexCliAdapter.parse(file.contents);
    expect(parsed.servers?.playwright).toEqual({
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest'],
      env: { HEADLESS: 'true' },
      tags: [],
    });
    expect(parsed.servers?.github?.transport).toBe('streamable-http');
  });

  it('preserves non-MCP tables when merging into an existing config.toml', () => {
    const existing = [
      'model = "gpt-5"',
      'approval_policy = "on-request"',
      '',
      '[features]',
      'experimental_use_rmcp_client = true',
      '',
      '[mcp_servers.stale]',
      'command = "old"',
      '',
    ].join('\n');
    const file = codexCliAdapter.render(sampleServers('codex-cli'), linux, existing);
    const doc = parseToml(file.contents) as Record<string, unknown>;
    // Non-MCP top-level keys and tables survive.
    expect(doc.model).toBe('gpt-5');
    expect(doc.approval_policy).toBe('on-request');
    expect((doc.features as Record<string, unknown>).experimental_use_rmcp_client).toBe(true);
    // The stale managed server is replaced by the canonical set.
    const mcp = doc.mcp_servers as Record<string, unknown>;
    expect(mcp.stale).toBeUndefined();
    expect(mcp.playwright).toBeDefined();
    expect(mcp.github).toBeDefined();
  });

  it('re-folding its own output is idempotent', () => {
    const first = codexCliAdapter.render(sampleServers('codex-cli'), linux).contents;
    const second = codexCliAdapter.render(sampleServers('codex-cli'), linux, first).contents;
    expect(second).toBe(first);
  });
});
