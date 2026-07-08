import { describe, expect, it, vi } from 'vitest';
import {
  infisicalProvider,
  parseInfisicalPath,
  type InfisicalFetch,
} from '../src/providers/infisical.js';

describe('parseInfisicalPath (S4.3)', () => {
  it('splits env / folder / key', () => {
    expect(parseInfisicalPath('dev/mcp/GITHUB_PAT')).toEqual({
      environment: 'dev',
      secretPath: '/mcp',
      key: 'GITHUB_PAT',
    });
  });
  it('handles a top-level secret (no folder)', () => {
    expect(parseInfisicalPath('prod/TOKEN')).toEqual({
      environment: 'prod',
      secretPath: '/',
      key: 'TOKEN',
    });
  });
  it('rejects a too-short path', () => {
    expect(() => parseInfisicalPath('TOKEN')).toThrow(/env\/\[folder/);
  });
});

describe('infisicalProvider (S4.3)', () => {
  const env = { INFISICAL_TOKEN: 'st.machine.identity', INFISICAL_PROJECT_ID: 'proj123' };

  it('resolves via the (mocked) API with parsed params', async () => {
    const fetchSecret = vi.fn<InfisicalFetch>(async (p) => {
      expect(p).toMatchObject({
        key: 'GITHUB_PAT',
        environment: 'dev',
        secretPath: '/mcp',
        token: 'st.machine.identity',
        projectId: 'proj123',
      });
      return 'ghp_resolved';
    });
    const provider = infisicalProvider({ env, fetchSecret });
    expect(await provider.resolve('dev/mcp/GITHUB_PAT')).toBe('ghp_resolved');
    expect(fetchSecret).toHaveBeenCalledOnce();
  });

  it('errors clearly when the token is missing', async () => {
    const provider = infisicalProvider({ env: {}, fetchSecret: async () => 'x' });
    await expect(provider.resolve('dev/mcp/X')).rejects.toThrow(/INFISICAL_TOKEN is not set/);
  });

  it('errors clearly when the project id is missing', async () => {
    const provider = infisicalProvider({
      env: { INFISICAL_TOKEN: 't' },
      fetchSecret: async () => 'x',
    });
    await expect(provider.resolve('dev/mcp/X')).rejects.toThrow(/INFISICAL_PROJECT_ID is not set/);
  });

  it('propagates a missing-secret error from the backend', async () => {
    const provider = infisicalProvider({
      env,
      fetchSecret: async () => {
        throw new Error('Infisical returned no value for "X"');
      },
    });
    await expect(provider.resolve('dev/X')).rejects.toThrow(/no value/);
  });
});
