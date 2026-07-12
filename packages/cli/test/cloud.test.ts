import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Config } from '@mcpfold/core';
import type { CloudApi, PollResponse, PullResponse, PushBody } from '../src/cloud/api.js';
import { httpCloudApi } from '../src/cloud/api.js';
import { inMemoryBackend, loadSession, saveSession } from '../src/cloud/token-store.js';
import { getOrCreateSigningKey, signConfig } from '../src/trust/signing.js';
import type { ExecutableEntry, TrustGate, TrustStatus } from '../src/trust/tofu.js';
import { runLogin } from '../src/commands/login.js';
import { runPush } from '../src/commands/push.js';
import { runPull } from '../src/commands/pull.js';
import { EXIT } from '../src/output/exit-codes.js';

const CONFIG: Config = {
  version: 2,
  servers: {
    gh: {
      transport: 'streamable-http',
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
  const remoteConfig = {
    ...CONFIG,
    servers: {
      ...CONFIG.servers,
      extra: { transport: 'stdio' as const, command: 'npx', tags: [] },
    },
  };
  const remote: PullResponse = {
    id: 'cfg-2',
    version: 5,
    created_at: 'now',
    created_by: 'user-1',
    config: remoteConfig,
  };
  const signedRemote = (key: string): PullResponse => ({
    ...remote,
    signature: signConfig(remoteConfig, key),
  });

  // A minimal TrustGate that treats every executable server as untrusted and records approvals,
  // so tests can assert whether the pull path pre-approved launch commands.
  function recordingGate(): TrustGate & { approved: string[] } {
    const approved: string[] = [];
    return {
      status: (): TrustStatus => 'new',
      isTrusted: () => false,
      approve: (name: string, _entry: ExecutableEntry) => approved.push(name),
      trustedTools: () => undefined,
      toolsStatus: () => 'unpinned',
      approveTools: () => {},
      approved,
    };
  }

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

  it('applies a verified (signed) config with --yes alone (S16.5)', async () => {
    writeFileSync(join(cwd, 'mcp.config.jsonc'), CONFIG_TEXT);
    const backend = inMemoryBackend();
    await saveSession(futureSession(), backend);
    const key = await getOrCreateSigningKey(backend);
    const api = fakeApi({ pull: async () => signedRemote(key) });
    const gate = recordingGate();

    const out = await runPull({ cwd, api, backend, yes: true, gate });
    expect(out.data.applied).toBe(true);
    const written = readFileSync(join(cwd, 'mcp.config.jsonc'), 'utf8');
    expect(written).toContain('"extra"');
    expect(written).toContain('${env:GH_PAT}'); // refs preserved
    // A verified config under --yes pre-approves the pulled launch commands.
    expect(gate.approved).toContain('extra');
  });

  // S22.5: a pull must back up the pre-existing canonical config before clobbering it.
  it('backs up the local canonical config before applying, and surfaces the backup path', async () => {
    // Seed a canonical config with an uncommitted local edit that the pull would overwrite.
    const local = CONFIG_TEXT.replace('"gh"', '"my-local-edit"');
    writeFileSync(join(cwd, 'mcp.config.jsonc'), local);
    const backend = inMemoryBackend();
    await saveSession(futureSession(), backend);
    const key = await getOrCreateSigningKey(backend);
    const api = fakeApi({ pull: async () => signedRemote(key) });

    const out = await runPull({
      cwd,
      api,
      backend,
      yes: true,
      gate: recordingGate(),
      now: () => Date.parse('2026-07-11T00:00:00Z'),
    });
    expect(out.data.applied).toBe(true);
    // The backup path is returned and surfaced in the human output.
    expect(out.data.backup).toBeTruthy();
    expect(out.human).toContain('Backed up');
    // The backup preserves the ORIGINAL local contents (the overwritten edit is recoverable).
    expect(readFileSync(out.data.backup!, 'utf8')).toBe(local);
    // And the target now holds the pulled config.
    expect(readFileSync(join(cwd, 'mcp.config.jsonc'), 'utf8')).toContain('"extra"');
  });

  it('does not create a backup when there is no local config to overwrite (S22.5)', async () => {
    // No mcp.config.jsonc seeded — a first-time pull has nothing to back up.
    const backend = inMemoryBackend();
    await saveSession(futureSession(), backend);
    const key = await getOrCreateSigningKey(backend);
    const api = fakeApi({ pull: async () => signedRemote(key) });

    const out = await runPull({ cwd, api, backend, yes: true, gate: recordingGate() });
    expect(out.data.applied).toBe(true);
    expect(out.data.backup).toBeNull();
    expect(out.human).not.toContain('Backed up');
  });

  it('refuses an unsigned config under --yes alone; --allow-unsigned applies it (S16.5)', async () => {
    writeFileSync(join(cwd, 'mcp.config.jsonc'), CONFIG_TEXT);
    const backend = inMemoryBackend();
    await saveSession(futureSession(), backend);
    const api = fakeApi({ pull: async () => remote }); // unsigned
    const gate = recordingGate();

    // --yes alone is refused: no write, no trust approval, clear guidance.
    const refused = await runPull({ cwd, api, backend, yes: true, gate });
    expect(refused.data.applied).toBe(false);
    expect(refused.exit).toBe(EXIT.DIFF);
    expect(refused.human).toContain('--allow-unsigned');
    expect(refused.human).toMatch(/unsigned/);
    expect(readFileSync(join(cwd, 'mcp.config.jsonc'), 'utf8')).toBe(CONFIG_TEXT);
    expect(gate.approved).toHaveLength(0);

    // Explicit opt-in applies it and (only now) pre-approves the launch commands.
    const applied = await runPull({ cwd, api, backend, yes: true, allowUnsigned: true, gate });
    expect(applied.data.applied).toBe(true);
    expect(readFileSync(join(cwd, 'mcp.config.jsonc'), 'utf8')).toContain('"extra"');
    expect(gate.approved).toContain('extra');
  });

  it('refuses a signed config when no local key is present, until --allow-unsigned (S16.5)', async () => {
    writeFileSync(join(cwd, 'mcp.config.jsonc'), CONFIG_TEXT);
    const backend = inMemoryBackend(); // no signing key on this machine
    await saveSession(futureSession(), backend);
    // Sign with some other key; this machine can't verify it.
    const api = fakeApi({ pull: async () => signedRemote('deadbeef'.repeat(8)) });
    const gate = recordingGate();

    const refused = await runPull({ cwd, api, backend, yes: true, gate });
    expect(refused.data.applied).toBe(false);
    expect(refused.human).toContain('--allow-unsigned');
    expect(refused.human).toMatch(/no local signing key/);
    expect(gate.approved).toHaveLength(0);

    const applied = await runPull({ cwd, api, backend, yes: true, allowUnsigned: true, gate });
    expect(applied.data.applied).toBe(true);
    expect(gate.approved).toContain('extra');
  });

  it('hard-rejects an INVALID signature regardless of --allow-unsigned (S16.5)', async () => {
    writeFileSync(join(cwd, 'mcp.config.jsonc'), CONFIG_TEXT);
    const backend = inMemoryBackend();
    await saveSession(futureSession(), backend);
    const key = await getOrCreateSigningKey(backend);
    // A signature over different content → invalid under this machine's key.
    const tampered: PullResponse = { ...remote, signature: signConfig(CONFIG, key) };
    const api = fakeApi({ pull: async () => tampered });

    await expect(
      runPull({ cwd, api, backend, yes: true, allowUnsigned: true, gate: recordingGate() }),
    ).rejects.toThrow(/SIGNATURE is INVALID/);
    // Nothing applied.
    expect(readFileSync(join(cwd, 'mcp.config.jsonc'), 'utf8')).toBe(CONFIG_TEXT);
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

describe('httpCloudApi.refresh response validation (S22.15)', () => {
  const fetchReturning = (status: number, body: unknown): typeof fetch =>
    (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  const refresh = (status: number, body: unknown) =>
    httpCloudApi('https://api.test', fetchReturning(status, body)).refresh('rt');

  it('returns a validated response for a well-formed 200 (rotated or not)', async () => {
    expect(
      await refresh(200, { access_token: 'a2', expires_in: 3600, refresh_token: 'r2' }),
    ).toEqual({
      access_token: 'a2',
      expires_in: 3600,
      refresh_token: 'r2',
    });
    // A server that does not rotate the refresh token omits it — that is allowed.
    expect(await refresh(200, { access_token: 'a2', expires_in: 3600 })).toEqual({
      access_token: 'a2',
      expires_in: 3600,
    });
  });

  it('rejects a 200 missing the access token (no silent logout)', async () => {
    await expect(refresh(200, { expires_in: 3600 })).rejects.toThrow(/malformed session/);
  });

  it('rejects a 200 whose expires_in is not finite (no re-refresh spin)', async () => {
    await expect(refresh(200, { access_token: 'a2', expires_in: 'soon' })).rejects.toThrow(
      /invalid expires_in/,
    );
    await expect(refresh(200, { access_token: 'a2', expires_in: null })).rejects.toThrow(
      /invalid expires_in/,
    );
  });

  it('rejects a 200 with an empty rotated refresh token', async () => {
    await expect(
      refresh(200, { access_token: 'a2', expires_in: 3600, refresh_token: '' }),
    ).rejects.toThrow(/malformed session/);
  });
});
