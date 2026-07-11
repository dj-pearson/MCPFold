import { describe, expect, it } from 'vitest';
import { claudeCodeAdapter } from '../src/claude-code.js';
import { sampleServers } from './fixtures/servers.js';
import type { OsContext } from '../src/types.js';

const linux: OsContext = { platform: 'linux', home: '/home/dev', env: {} };

describe('claudeCodeAdapter (S2.4)', () => {
  it('resolves user (~/.claude.json) and project (.mcp.json) paths', () => {
    expect(claudeCodeAdapter.resolvePath('user', undefined, linux)).toBe('/home/dev/.claude.json');
    expect(claudeCodeAdapter.resolvePath('project', '/repos/x', linux)).toBe('/repos/x/.mcp.json');
  });

  it('emits an explicit per-server type field', async () => {
    const file = claudeCodeAdapter.render(sampleServers('claude-code'), linux);
    expect(file.contents).toContain('"type": "http"');
    expect(file.contents).toContain('"type": "stdio"');
    await expect(file.contents).toMatchFileSnapshot('fixtures/claude-code/claude.json');
  });

  it('parse tolerates both explicit type and inferred', () => {
    const explicit = claudeCodeAdapter.parse(
      '{"mcpServers":{"a":{"type":"http","url":"https://x.test/mcp"},"b":{"command":"npx"}}}',
    );
    expect(explicit.servers?.a?.transport).toBe('streamable-http');
    expect(explicit.servers?.b?.transport).toBe('stdio');
  });

  // S17.3: Claude Code errors on a remote entry with `url` but no `type`, so lock that every
  // remote render carries an explicit type, and accept its `streamable-http` alias on parse.
  it('every remote render carries an explicit type (never a typeless url)', () => {
    const file = claudeCodeAdapter.render(sampleServers('claude-code'), linux);
    const parsed = JSON.parse(file.contents) as {
      mcpServers: Record<string, { url?: string; type?: string }>;
    };
    for (const entry of Object.values(parsed.mcpServers)) {
      if (entry.url !== undefined) expect(entry.type).toBeTruthy();
    }
  });

  it('parse accepts the `streamable-http` alias as http', () => {
    const parsed = claudeCodeAdapter.parse(
      '{"mcpServers":{"s":{"type":"streamable-http","url":"https://x.test/mcp"}}}',
    );
    expect(parsed.servers?.s?.transport).toBe('streamable-http');
    expect(parsed.servers?.s?.url).toBe('https://x.test/mcp');
  });

  // S22.2 (BLOCKER, data loss): ~/.claude.json holds Claude Code's ENTIRE user state (OAuth
  // account, project history, numStartups). A sync must replace only `mcpServers` and keep the rest.
  it('merges into ~/.claude.json — preserves OAuth account, history, and every non-MCP key', () => {
    const existing = JSON.stringify(
      {
        numStartups: 42,
        oauthAccount: { accountUuid: 'abc-123', emailAddress: 'dev@example.com' },
        projects: { '/repos/x': { history: ['ran a thing'] } },
        mcpServers: { stale: { command: 'old' } },
      },
      null,
      2,
    );
    const file = claudeCodeAdapter.render(sampleServers('claude-code'), linux, existing);
    const doc = JSON.parse(file.contents) as {
      numStartups: number;
      oauthAccount: { accountUuid: string; emailAddress: string };
      projects: Record<string, unknown>;
      mcpServers: Record<string, unknown>;
    };
    // Non-MCP state survives untouched.
    expect(doc.numStartups).toBe(42);
    expect(doc.oauthAccount.accountUuid).toBe('abc-123');
    expect(doc.oauthAccount.emailAddress).toBe('dev@example.com');
    expect(doc.projects['/repos/x']).toEqual({ history: ['ran a thing'] });
    // Only the servers key is replaced with the canonical set.
    expect(Object.keys(doc.mcpServers).sort()).toEqual(['github', 'playwright']);
    expect(doc.mcpServers.stale).toBeUndefined();
  });

  it('re-folding its own merged output is idempotent (no drift on second sync)', () => {
    const existing = JSON.stringify({ oauthAccount: { id: 'x' } }, null, 2);
    const first = claudeCodeAdapter.render(sampleServers('claude-code'), linux, existing);
    const second = claudeCodeAdapter.render(sampleServers('claude-code'), linux, first.contents);
    expect(second.contents).toBe(first.contents);
  });

  it('fresh file (no existing) still renders a clean sorted config', () => {
    const file = claudeCodeAdapter.render(sampleServers('claude-code'), linux);
    const doc = JSON.parse(file.contents) as { mcpServers: Record<string, unknown> };
    expect(Object.keys(doc)).toEqual(['mcpServers']);
    expect(Object.keys(doc.mcpServers).sort()).toEqual(['github', 'playwright']);
  });
});
