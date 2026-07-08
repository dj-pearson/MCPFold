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
    expect(explicit.servers?.a?.transport).toBe('http');
    expect(explicit.servers?.b?.transport).toBe('stdio');
  });
});
