import { describe, expect, it } from 'vitest';
import type { ResolvedServer } from '@mcpfold/core';
import { geminiCliAdapter } from '../src/gemini-cli.js';
import type { OsContext } from '../src/types.js';

const linux: OsContext = { platform: 'linux', home: '/home/dev', env: {} };

const servers: ResolvedServer[] = [
  {
    name: 'http-server',
    transport: 'streamable-http',
    url: 'https://api.example.test/mcp',
    auth: { type: 'header', headers: { 'X-Api-Key': '${env:KEY}' } },
    tags: [],
    client: 'gemini-cli',
    scope: 'user',
  },
  {
    name: 'sse-server',
    transport: 'sse',
    url: 'https://sse.example.test/mcp',
    tags: [],
    client: 'gemini-cli',
    scope: 'user',
  },
  {
    name: 'local',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@playwright/mcp@1.4.2'],
    tags: [],
    client: 'gemini-cli',
    scope: 'user',
  },
];

describe('geminiCliAdapter (S14.1, S17.3)', () => {
  it('resolves ~/.gemini/settings.json for user scope and rejects others', () => {
    expect(geminiCliAdapter.resolvePath('user', undefined, linux)).toBe(
      '/home/dev/.gemini/settings.json',
    );
    expect(() => geminiCliAdapter.resolvePath('project', '/x', linux)).toThrow(/user scope/);
  });

  it('renders `httpUrl` for streamable HTTP and `url` for SSE (per current docs)', () => {
    const file = geminiCliAdapter.render(servers, linux);
    const parsed = JSON.parse(file.contents) as {
      mcpServers: Record<string, Record<string, unknown>>;
    };
    // streamable HTTP → httpUrl, never a plain url.
    expect(parsed.mcpServers['http-server']!.httpUrl).toBe('https://api.example.test/mcp');
    expect(parsed.mcpServers['http-server']!.url).toBeUndefined();
    expect(parsed.mcpServers['http-server']!.headers).toEqual({ 'X-Api-Key': '${env:KEY}' });
    // SSE → url, never httpUrl.
    expect(parsed.mcpServers['sse-server']!.url).toBe('https://sse.example.test/mcp');
    expect(parsed.mcpServers['sse-server']!.httpUrl).toBeUndefined();
    // stdio unchanged.
    expect(parsed.mcpServers.local!.command).toBe('npx');
  });

  it('parse reverses httpUrl → http and url → sse', () => {
    const file = geminiCliAdapter.render(servers, linux);
    const parsed = geminiCliAdapter.parse(file.contents);
    expect(parsed.servers?.['http-server']?.transport).toBe('streamable-http');
    expect(parsed.servers?.['http-server']?.url).toBe('https://api.example.test/mcp');
    expect(parsed.servers?.['sse-server']?.transport).toBe('sse');
    expect(parsed.servers?.['sse-server']?.url).toBe('https://sse.example.test/mcp');
    expect(parsed.servers?.local?.transport).toBe('stdio');
  });
});
