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
});
