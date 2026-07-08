import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type CloudSession,
  clearSession,
  inMemoryBackend,
  keychainCommands,
  loadSession,
  saveSession,
} from '../src/cloud/token-store.js';

const SESSION: CloudSession = {
  accessToken: 'eyJhbGciOi.header.sig',
  refreshToken: 'refresh-token-value-should-stay-in-keychain',
  expiresAt: 1_700_003_600,
  endpoint: 'https://api.mcpfold.com',
};

describe('token store (S6.3)', () => {
  it('round-trips a session through the keychain backend', async () => {
    const backend = inMemoryBackend();
    expect(await loadSession(backend)).toBeNull();
    await saveSession(SESSION, backend);
    expect(await loadSession(backend)).toEqual(SESSION);
    await clearSession(backend);
    expect(await loadSession(backend)).toBeNull();
  });

  it('returns null for a malformed stored value rather than throwing', async () => {
    const backend = inMemoryBackend();
    await backend.set('session', 'not-json');
    expect(await loadSession(backend)).toBeNull();
    await backend.set('session', JSON.stringify({ accessToken: 1 }));
    expect(await loadSession(backend)).toBeNull();
  });

  it('never persists the session to a file (module has no fs access)', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, '../src/cloud/token-store.ts'), 'utf8');
    expect(src).not.toMatch(/node:fs/);
    expect(src).not.toMatch(/writeFile/);
  });

  it('builds correct per-OS credential-store commands, keeping the secret out of argv on Linux', () => {
    const secret = 'TOP-SECRET-TOKEN';

    const mac = keychainCommands('darwin', 'session');
    expect(mac.set(secret).command).toBe('security');
    expect(mac.set(secret).args).toContain('add-generic-password');
    expect(mac.get.args).toContain('find-generic-password');

    const linux = keychainCommands('linux', 'session');
    const linuxSet = linux.set(secret);
    expect(linuxSet.command).toBe('secret-tool');
    // The value is piped over stdin, never exposed as a process argument.
    expect(linuxSet.stdin).toBe(secret);
    expect(linuxSet.args).not.toContain(secret);

    const win = keychainCommands('win32', 'session');
    expect(win.set(secret).command).toBe('powershell');
    expect(win.set(secret).args.join(' ')).toContain('New-StoredCredential');
  });
});
