import { spawn } from 'node:child_process';

/**
 * Secure storage for the cloud session (S6.3). The device-code flow (services/edge) returns
 * an access token + refresh token; those are persisted ONLY in the OS keychain — never in a
 * plaintext file — so a token leak can't come from mcpfold's own on-disk state.
 *
 * This module has no filesystem access by construction: it stores through an injectable
 * `KeychainBackend` whose default implementation shells out to the platform credential store
 * (macOS Keychain, Linux libsecret, Windows CredentialManager). `mcpfold login` (S6.6) is the
 * command that populates it; `push`/`pull` read it.
 */

/** The session persisted after a successful `mcpfold login`. */
export interface CloudSession {
  accessToken: string;
  refreshToken: string;
  /** Unix seconds when the access token expires (refresh before this). */
  expiresAt: number;
  /** API base URL this session authenticates against. */
  endpoint: string;
}

/** A place to store/retrieve/remove a single secret string keyed by account. */
export interface KeychainBackend {
  set(account: string, secret: string): Promise<void>;
  get(account: string): Promise<string | null>;
  delete(account: string): Promise<void>;
}

const SERVICE = 'mcpfold';
const SESSION_ACCOUNT = 'session';

/** A test backend that keeps values in memory (never touches disk or the OS). */
export function inMemoryBackend(): KeychainBackend {
  const store = new Map<string, string>();
  return {
    set: (account, secret) => {
      store.set(account, secret);
      return Promise.resolve();
    },
    get: (account) => Promise.resolve(store.get(account) ?? null),
    delete: (account) => {
      store.delete(account);
      return Promise.resolve();
    },
  };
}

interface KeychainCommand {
  command: string;
  args: string[];
  /** When set, the secret value is piped via stdin instead of appearing in argv. */
  stdin?: string;
}

/** Per-OS credential-store commands for a set/get/delete operation. Exported for testing. */
export function keychainCommands(
  platform: NodeJS.Platform,
  account: string,
): { set(secret: string): KeychainCommand; get: KeychainCommand; delete: KeychainCommand } {
  const target = `${SERVICE}:${account}`;
  switch (platform) {
    case 'darwin':
      return {
        set: (secret) => ({
          command: 'security',
          args: ['add-generic-password', '-U', '-s', SERVICE, '-a', account, '-w', secret],
        }),
        get: {
          command: 'security',
          args: ['find-generic-password', '-s', SERVICE, '-a', account, '-w'],
        },
        delete: {
          command: 'security',
          args: ['delete-generic-password', '-s', SERVICE, '-a', account],
        },
      };
    case 'win32':
      return {
        set: (secret) => ({
          command: 'powershell',
          args: [
            '-NoProfile',
            '-Command',
            `New-StoredCredential -Target '${target}' -UserName '${SERVICE}' ` +
              `-Password '${secret.replace(/'/g, "''")}' -Persist LocalMachine | Out-Null`,
          ],
        }),
        get: {
          command: 'powershell',
          args: [
            '-NoProfile',
            '-Command',
            `(Get-StoredCredential -Target '${target}').GetNetworkCredential().Password`,
          ],
        },
        delete: {
          command: 'powershell',
          args: ['-NoProfile', '-Command', `Remove-StoredCredential -Target '${target}'`],
        },
      };
    default: // linux / libsecret — value goes over stdin, never argv.
      return {
        set: (secret) => ({
          command: 'secret-tool',
          args: ['store', '--label', `mcpfold ${account}`, 'service', SERVICE, 'account', account],
          stdin: secret,
        }),
        get: { command: 'secret-tool', args: ['lookup', 'service', SERVICE, 'account', account] },
        delete: { command: 'secret-tool', args: ['clear', 'service', SERVICE, 'account', account] },
      };
  }
}

function run(spec: KeychainCommand): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(spec.command, spec.args, {
        stdio: [spec.stdin ? 'pipe' : 'ignore', 'pipe', 'ignore'],
      });
    } catch (error) {
      reject(error);
      return;
    }
    let stdout = '';
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (d: string) => (stdout += d));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, stdout }));
    if (spec.stdin !== undefined) {
      child.stdin!.end(spec.stdin);
    }
  });
}

/** The default backend: the platform's native credential store. */
export function osKeychainBackend(platform: NodeJS.Platform = process.platform): KeychainBackend {
  const cmds = (account: string) => keychainCommands(platform, account);
  return {
    async set(account, secret) {
      const { code } = await run(cmds(account).set(secret));
      if (code !== 0)
        throw new Error(`failed to store credential in the OS keychain (${platform})`);
    },
    async get(account) {
      const { code, stdout } = await run(cmds(account).get).catch(() => ({ code: 1, stdout: '' }));
      if (code !== 0) return null;
      return stdout.replace(/\r?\n$/, '');
    },
    async delete(account) {
      await run(cmds(account).delete).catch(() => undefined);
    },
  };
}

/** Persist the cloud session to the keychain (never to a file). */
export async function saveSession(session: CloudSession, backend: KeychainBackend): Promise<void> {
  await backend.set(SESSION_ACCOUNT, JSON.stringify(session));
}

/** Load the cloud session from the keychain, or null if not logged in / unreadable. */
export async function loadSession(backend: KeychainBackend): Promise<CloudSession | null> {
  const raw = await backend.get(SESSION_ACCOUNT);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CloudSession;
    if (typeof parsed.accessToken === 'string' && typeof parsed.refreshToken === 'string') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/** Remove the stored session (logout). */
export async function clearSession(backend: KeychainBackend): Promise<void> {
  await backend.delete(SESSION_ACCOUNT);
}
