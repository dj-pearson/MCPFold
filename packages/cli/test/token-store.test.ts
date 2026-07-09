import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type CloudSession,
  clearSession,
  inMemoryBackend,
  keychainCommands,
  loadSession,
  osKeychainBackend,
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
    const winSet = win.set(secret);
    expect(winSet.command).toBe('powershell');
    // S16.3: DPAPI, not the third-party CredentialManager module; secret over stdin, not argv.
    const winSetArgs = winSet.args.join(' ');
    expect(winSetArgs).toContain('ProtectedData');
    expect(winSetArgs).toContain('CurrentUser');
    expect(winSetArgs).not.toContain('StoredCredential'); // no third-party module dependency
    expect(winSet.stdin).toBe(secret);
    expect(winSetArgs).not.toContain(secret);
    // get/delete address the per-account DPAPI file and never carry the secret.
    expect(win.get.args.join(' ')).toContain('mcpfold-session.cred');
    expect(win.get.args.join(' ')).toContain('Unprotect');
    expect(win.delete.args.join(' ')).toContain('Remove-Item');
  });
});

describe('token store — Windows DPAPI round-trip (S16.3)', () => {
  // A real store/read/clear against built-in DPAPI, sandboxed to a temp dir so the developer's
  // actual session is never touched. Windows-only (DPAPI is a Windows facility).
  let sandbox: string | undefined;
  const prevCredDir = process.env.MCPFOLD_CRED_DIR;
  afterEach(() => {
    if (prevCredDir === undefined) delete process.env.MCPFOLD_CRED_DIR;
    else process.env.MCPFOLD_CRED_DIR = prevCredDir;
    if (sandbox) rmSync(sandbox, { recursive: true, force: true });
  });

  it.runIf(process.platform === 'win32')(
    'stores and reads back a session with no third-party module, encrypted on disk',
    async () => {
      sandbox = mkdtempSync(join(tmpdir(), 'mcpfold-cred-'));
      process.env.MCPFOLD_CRED_DIR = sandbox;
      const backend = osKeychainBackend('win32');

      expect(await loadSession(backend)).toBeNull();
      await saveSession(SESSION, backend);
      // Round-trips through the real credential store.
      expect(await loadSession(backend)).toEqual(SESSION);

      // The on-disk blob exists but is DPAPI-encrypted — the secret is not readable as plaintext.
      const file = join(sandbox, 'mcpfold-session.cred');
      expect(existsSync(file)).toBe(true);
      const raw = readFileSync(file, 'latin1');
      expect(raw).not.toContain(SESSION.refreshToken);
      expect(raw).not.toContain(SESSION.accessToken);

      await clearSession(backend);
      expect(await loadSession(backend)).toBeNull();
      expect(existsSync(file)).toBe(false);
    },
    20_000,
  );
});
