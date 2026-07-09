import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Config } from '@mcpfold/core';
import type { CloudApi, PollResponse, PullResponse, PushBody } from '../src/cloud/api.js';
import { httpCloudApi } from '../src/cloud/api.js';
import { inMemoryBackend, loadSession, saveSession } from '../src/cloud/token-store.js';
import { runLogin } from '../src/commands/login.js';
import { runPush } from '../src/commands/push.js';
import { runPull } from '../src/commands/pull.js';
import { EXIT } from '../src/output/exit-codes.js';

const CONFIG: Config = {
  version: 1,
  servers: {
    gh: {
      transport: 'http',
      url: 'https://api.github.com/mcp',
      auth: { type: 'bearer', token: '${env:GH_PAT}' },
      tags: ['work'],
    },
  },
  profiles: {},
};
const CONFIG_TEXT = JSON.stringify(CONFIG, null, 2);

const noSleep = async (): Promise<void> => {};
const futureSession = () => ({
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
  endpoint: 'https://api.test',
});

/** A configurable fake CloudApi with call capture. */
function fakeApi(overrides: Partial<CloudApi> = {}): CloudApi & { pushed: PushBody[] } {
  const pushed: PushBody[] = [];
  const base: CloudApi = {
    startDevice: async () => ({
      device_code: 'dc',
      user_code: 'WDJB-MJHT',
      verification_uri: 'https://api.test/auth/device',
      verification_uri_complete: 'https://api.test/auth/device?code=WDJB-MJHT',
      expires_in: 600,
      interval: 5,
    }),
    pollDevice: async () => ({ status: 'pending', interval: 5 }) as PollResponse,
    refresh: async () => ({ access_token: 'access-refreshed', expires_in: 3600 }),
    push: async (_t, body) => {
      pushed.push(body);
      return { id: 'cfg-1', version: 2, created_at: 'now' };
    },
    pull: async () => null,
    ...overrides,
  };
  return Object.assign(base, { pushed });
}

let cwd: string;
beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'mcpfold-cloud-'));
});
afterEach(() => rmSync(cwd, { recursive: true, force: true }));

describe('login (S6.6)', () => {
  it('completes the device flow and stores the session in the keychain', async () => {
    const backend = inMemoryBackend();
    let polls = 0;
    const api = fakeApi({
      pollDevice: async () => {
        polls += 1;
        return polls < 2
          ? ({ status: 'pending', interval: 5 } as PollResponse)
          : ({
              status: 'complete',
              access_token: 'at',
              refresh_token: 'rt',
              expires_in: 3600,
            } as PollResponse);
      },
    });
    const printed: string[] = [];
    const out = await runLogin({
      api,
      backend,
      endpoint: 'https://api.test',
      machineName: 'laptop',
      print: (m) => printed.push(m),
      sleep: noSleep,
    });
    expect(printed.join('\n')).toContain('WDJB-MJHT');
    expect(out.human).toContain('Logged in');
    const session = await loadSession(backend);
    expect(session?.accessToken).toBe('at');
    expect(session?.refreshToken).toBe('rt');
    expect(session?.endpoint).toBe('https://api.test');
  });

  it('fails clearly when the device code is rejected', async () => {
    const api = fakeApi({ pollDevice: async () => ({ status: 'error', error: 'expired_token' }) });
    await expect(
      runLogin({
        api,
        backend: inMemoryBackend(),
        endpoint: 'https://api.test',
        print: () => {},
        sleep: noSleep,
      }),
    ).rejects.toThrow(/Login failed/);
  });
});

describe('push (S6.6)', () => {
  it('uploads the canonical config (refs intact) as a new version', async () => {
    writeFileSync(join(cwd, 'mcp.config.jsonc'), CONFIG_TEXT);
    const backend = inMemoryBackend();
    await saveSession(futureSession(), backend);
    const api = fakeApi();

    const out = await runPush({ cwd, api, backend, machineName: 'laptop' });
    expect(out.human).toContain('version 2');
    expect(api.pushed).toHaveLength(1);
    expect(api.pushed[0]!.machine_name).toBe('laptop');
    // The reference survived; no raw value was ever in the payload.
    expect(api.pushed[0]!.config.servers.gh!.auth!.token).toBe('${env:GH_PAT}');
  });

  it('refuses to push a config carrying a raw secret (client guard), sending nothing', async () => {
    // A raw token hidden in an env value — the schema permits arbitrary env strings, so the
    // client guard (not schema validation) is what must catch it.
    const leaky: Config = {
      ...CONFIG,
      servers: {
        gh: { ...CONFIG.servers.gh!, env: { API_KEY: 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123' } },
      },
    };
    writeFileSync(join(cwd, 'mcp.config.jsonc'), JSON.stringify(leaky, null, 2));
    const backend = inMemoryBackend();
    await saveSession(futureSession(), backend);
    const api = fakeApi();

    await expect(runPush({ cwd, api, backend })).rejects.toThrow(/raw secret/i);
    expect(api.pushed).toHaveLength(0);
  });

  it('fails clearly when not logged in', async () => {
    writeFileSync(join(cwd, 'mcp.config.jsonc'), CONFIG_TEXT);
    await expect(runPush({ cwd, api: fakeApi(), backend: inMemoryBackend() })).rejects.toThrow(
      /Not logged in/,
    );
  });

  it('refreshes an expired access token before pushing', async () => {
    writeFileSync(join(cwd, 'mcp.config.jsonc'), CONFIG_TEXT);
    const backend = inMemoryBackend();
    await saveSession(
      { ...futureSession(), expiresAt: Math.floor(Date.now() / 1000) - 10 },
      backend,
    );
    let refreshed = false;
    const api = fakeApi({
      refresh: async () => {
        refreshed = true;
        return { access_token: 'access-refreshed', expires_in: 3600 };
      },
    });
    await runPush({ cwd, api, backend });
    expect(refreshed).toBe(true);
    expect((await loadSession(backend))?.accessToken).toBe('access-refreshed');
  });
});

describe('pull (S6.6)', () => {
  const remote: PullResponse = {
    id: 'cfg-2',
    version: 5,
    created_at: 'now',
    created_by: 'user-1',
    config: {
      ...CONFIG,
      servers: { ...CONFIG.servers, extra: { transport: 'stdio', command: 'npx', tags: [] } },
    },
  };

  it('shows a diff without applying when --yes is absent', async () => {
    writeFileSync(join(cwd, 'mcp.config.jsonc'), CONFIG_TEXT);
    const backend = inMemoryBackend();
    await saveSession(futureSession(), backend);
    const api = fakeApi({ pull: async () => remote });

    const out = await runPull({ cwd, api, backend });
    expect(out.exit).toBe(EXIT.DIFF);
    expect(out.human).toContain('extra');
    expect(out.human).toContain('--yes');
    // Local file untouched.
    expect(readFileSync(join(cwd, 'mcp.config.jsonc'), 'utf8')).toBe(CONFIG_TEXT);
  });

  it('applies the remote config with --yes', async () => {
    writeFileSync(join(cwd, 'mcp.config.jsonc'), CONFIG_TEXT);
    const backend = inMemoryBackend();
    await saveSession(futureSession(), backend);
    const api = fakeApi({ pull: async () => remote });

    const out = await runPull({ cwd, api, backend, yes: true });
    expect(out.data.applied).toBe(true);
    const written = readFileSync(join(cwd, 'mcp.config.jsonc'), 'utf8');
    expect(written).toContain('"extra"');
    expect(written).toContain('${env:GH_PAT}'); // refs preserved
  });

  it('reports nothing to pull when the server has no config', async () => {
    const backend = inMemoryBackend();
    await saveSession(futureSession(), backend);
    const out = await runPull({ cwd, api: fakeApi({ pull: async () => null }), backend });
    expect(out.human).toMatch(/Nothing to pull/);
  });

  it('fails clearly when not logged in', async () => {
    await expect(runPull({ cwd, api: fakeApi(), backend: inMemoryBackend() })).rejects.toThrow(
      /Not logged in/,
    );
  });
});

describe('httpCloudApi.pollDevice response validation (S16.6)', () => {
  // A fetch that returns one canned response for the poll POST.
  const fetchReturning = (status: number, body: unknown): typeof fetch =>
    (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  const poll = (status: number, body: unknown) =>
    httpCloudApi('https://api.test', fetchReturning(status, body)).pollDevice('dc');

  it('returns complete only for a well-formed session', async () => {
    const res = await poll(200, { access_token: 'at', refresh_token: 'rt', expires_in: 3600 });
    expect(res).toEqual({
      status: 'complete',
      access_token: 'at',
      refresh_token: 'rt',
      expires_in: 3600,
    });
  });

  it('rejects a 200 that is missing the access token', async () => {
    await expect(poll(200, { refresh_token: 'rt', expires_in: 3600 })).rejects.toThrow(
      /malformed session/,
    );
  });

  it('rejects a 200 with an empty refresh token', async () => {
    await expect(
      poll(200, { access_token: 'at', refresh_token: '', expires_in: 3600 }),
    ).rejects.toThrow(/malformed session/);
  });

  it('rejects a 200 whose expires_in is not a finite number', async () => {
    await expect(
      poll(200, { access_token: 'at', refresh_token: 'rt', expires_in: 'soon' }),
    ).rejects.toThrow(/invalid expires_in/);
    await expect(
      poll(200, { access_token: 'at', refresh_token: 'rt', expires_in: null }),
    ).rejects.toThrow(/invalid expires_in/);
  });

  it('leaves the pending and error poll paths unchanged', async () => {
    expect(await poll(400, { error: 'authorization_pending', interval: 7 })).toEqual({
      status: 'pending',
      interval: 7,
    });
    expect(await poll(400, { error: 'expired_token' })).toEqual({
      status: 'error',
      error: 'expired_token',
    });
  });
});
