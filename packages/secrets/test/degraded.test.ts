import { describe, expect, it } from 'vitest';
import { isMcpfoldError, loadConfig, diffRendered, type ResolvedServer } from '@mcpfold/core';
import { resolveSecrets } from '../src/resolver.js';
import type { SecretProvider } from '../src/types.js';

/**
 * The S0.9 degraded-mode contract: provider timeout, provider error, and full offline each
 * fail closed with a coded error; secret-free operations still work offline.
 */

const refServer: ResolvedServer = {
  name: 'gh',
  transport: 'streamable-http',
  url: 'https://x/mcp',
  auth: { type: 'bearer', token: '${slow:tok}' },
  tags: [],
  client: 'cursor',
  scope: 'user',
};

describe('degraded mode (S0.9)', () => {
  it('a hung provider that ignores the signal still times out and fails closed', async () => {
    // Worst case: a provider that never settles and ignores the abort signal.
    const hung: SecretProvider = { scheme: 'slow', resolve: () => new Promise<string>(() => {}) };
    await expect(
      resolveSecrets([refServer], { providers: [hung], timeoutMs: 30 }),
    ).rejects.toSatisfy(
      (e) => isMcpfoldError(e) && e.code === 'SECRET_RESOLUTION' && /timed out/i.test(e.message),
    );
  });

  it('a provider error fails closed with the provider + ref named', async () => {
    const broken: SecretProvider = {
      scheme: 'slow',
      resolve: async () => {
        throw new Error('server 500');
      },
    };
    await expect(resolveSecrets([refServer], { providers: [broken] })).rejects.toSatisfy(
      (e) => isMcpfoldError(e) && e.message.includes('${slow:tok}') && e.message.includes('slow'),
    );
  });

  it('full offline (no provider registered) fails closed, not silently blank', async () => {
    await expect(resolveSecrets([refServer], { providers: [] })).rejects.toSatisfy(
      (e) => isMcpfoldError(e) && e.code === 'SECRET_RESOLUTION',
    );
  });

  it('secret-free ops still work fully offline: validate + ref-only diff', () => {
    const text = `{
      "version": 1,
      "servers": { "gh": { "transport": "http", "url": "https://x/mcp", "auth": { "type": "bearer", "token": "\${infisical:dev/x}" }, "tags": ["t"] } },
      "profiles": { "c": { "client": "cursor", "scope": "user", "include": ["t"] } }
    }`;
    // Validation works with no network/providers.
    expect(loadConfig(text).ok).toBe(true);
    // A ref-only diff needs no secret resolution.
    const parser = { parse: (c: string) => ({ servers: JSON.parse(c) as never }) };
    const diff = diffRendered(
      { contents: '{"gh":{"transport":"http"}}' },
      '{"gh":{"transport":"http"}}',
      parser,
    );
    expect(diff.hasDrift).toBe(false);
  });
});
