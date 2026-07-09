import { describe, expect, it, vi } from 'vitest';
import { isMcpfoldError, type ResolvedServer } from '@mcpfold/core';
import { resolveSecrets } from '../src/resolver.js';
import type { SecretProvider } from '../src/types.js';

function server(partial: Partial<ResolvedServer>): ResolvedServer {
  return {
    name: 's',
    transport: 'http',
    url: 'https://x/mcp',
    tags: [],
    client: 'cursor',
    scope: 'user',
    ...partial,
  };
}

describe('resolveSecrets (S4.1)', () => {
  it('injects resolved values for token, headers, and env refs', async () => {
    const fake: SecretProvider = { scheme: 'test', resolve: async (p) => `V(${p})` };
    const [out] = await resolveSecrets(
      [
        server({
          auth: { type: 'bearer', token: '${test:tok}', headers: { 'X-A': 'Bearer ${test:h}' } },
          env: { KEY: '${test:e}', PLAIN: 'literal' },
        }),
      ],
      { providers: [fake] },
    );
    expect(out?.auth?.token).toBe('V(tok)');
    expect(out?.auth?.headers?.['X-A']).toBe('Bearer V(h)');
    expect(out?.env?.KEY).toBe('V(e)');
    expect(out?.env?.PLAIN).toBe('literal');
  });

  it('memoizes within a run — the same ref is fetched once', async () => {
    const resolve = vi.fn(async (p: string) => `V(${p})`);
    const fake: SecretProvider = { scheme: 'test', resolve };
    await resolveSecrets(
      [
        server({ name: 'a', auth: { type: 'bearer', token: '${test:same}' } }),
        server({ name: 'b', auth: { type: 'bearer', token: '${test:same}' } }),
      ],
      { providers: [fake] },
    );
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('missing provider for a used scheme → structured SecretResolutionError', async () => {
    await expect(
      resolveSecrets([server({ auth: { type: 'bearer', token: '${infisical:x}' } })], {
        providers: [],
      }),
    ).rejects.toSatisfy(
      (e) => isMcpfoldError(e) && e.code === 'SECRET_RESOLUTION' && e.message.includes('infisical'),
    );
  });

  it('a provider timeout reports a terminated-provider error, distinct from other failures (S20.4)', async () => {
    const hang: SecretProvider = {
      scheme: 'slow',
      timeoutMs: 20, // fast timeout so the test is quick
      resolve: () => new Promise<string>(() => {}), // never settles on its own
    };
    await expect(
      resolveSecrets([server({ auth: { type: 'bearer', token: '${slow:x}' } })], {
        providers: [hang],
      }),
    ).rejects.toSatisfy(
      (e) =>
        isMcpfoldError(e) &&
        e.code === 'SECRET_RESOLUTION' &&
        /Timed out .*after 20ms — the provider was terminated/.test(e.message),
    );
  });

  it('fails closed — a provider error aborts and injects nothing', async () => {
    const good: SecretProvider = { scheme: 'ok', resolve: async () => 'value' };
    const bad: SecretProvider = {
      scheme: 'bad',
      resolve: async () => {
        throw new Error('boom');
      },
    };
    await expect(
      resolveSecrets([server({ env: { A: '${ok:a}', B: '${bad:b}' } })], {
        providers: [good, bad],
      }),
    ).rejects.toThrow(/Failed to resolve \$\{bad:b\}/);
  });
});
