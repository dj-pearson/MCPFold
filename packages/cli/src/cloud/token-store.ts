import { spawn } from 'node:child_process';

/**
 * Secure storage for the cloud session (S6.3). The device-code flow (services/edge) returns
 * an access token + refresh token; those are persisted ONLY in the OS keychain — never in a
 * plaintext file — so a token leak can't come from mcpfold's own on-disk state.
 *
 * This module has no filesystem access by construction: it stores through an injectable
 * `KeychainBackend` whose default implementation shells out to the platform credential store
 * (macOS Keychain, Linux libsecret). Windows uses built-in DPAPI (S16.3): the value is
 * DPAPI-encrypted, user-scoped, to a file under %APPDATA%\mcpfold — never plaintext, and with no
 * dependency on a third-party PowerShell module. All file IO happens inside the PowerShell script,
 * so this TS module still touches no filesystem. `mcpfold login` (S6.6) populates it; `push`/`pull`
 * read it.
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
  switch (platform) {
    case 'darwin':
      return {
        set: (secret) => ({
          command: 'security',
          // -w with NO inline value: the password is read from stdin, so it never appears in argv
          // (S22.14) — matching the Linux/Windows branches. `security` reads a piped stdin password.
          args: ['add-generic-password', '-U', '-s', SERVICE, '-a', account, '-w'],
          stdin: secret,
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
      return win32DpapiCommands(account);
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

/**
 * Windows credential commands backed by built-in DPAPI (S16.3) — no third-party PowerShell module.
 *
 * The secret is DPAPI-encrypted with the CurrentUser scope (only this Windows user can decrypt it,
 * even if the file is copied) and stored under %APPDATA%\mcpfold. `set` receives the value on stdin
 * so it never appears in argv; `get` decrypts to stdout; `delete` removes the file. The store
 * directory can be relocated with MCPFOLD_CRED_DIR (used by tests to sandbox the real store).
 */
function win32DpapiCommands(account: string): ReturnType<typeof keychainCommands> {
  const file = `${SERVICE}-${account.replace(/[^A-Za-z0-9._-]/g, '_')}.cred`;
  // Resolve the store directory (override → %APPDATA%\mcpfold) inside PowerShell each call.
  const dir = `$dir = if ($env:MCPFOLD_CRED_DIR) { $env:MCPFOLD_CRED_DIR } else { Join-Path $env:APPDATA 'mcpfold' }`;
  const path = `${dir}; $path = Join-Path $dir '${file}'`;
  const ps = (script: string): KeychainCommand => ({
    command: 'powershell',
    args: ['-NoProfile', '-NonInteractive', '-Command', script],
  });
  return {
    set: (secret) => ({
      ...ps(
        `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; ${path}; ` +
          `New-Item -ItemType Directory -Force -Path $dir | Out-Null; ` +
          `$secret = [Console]::In.ReadToEnd(); ` +
          `$bytes = [Text.Encoding]::UTF8.GetBytes($secret); ` +
          `$prot = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, ` +
          `[Security.Cryptography.DataProtectionScope]::CurrentUser); ` +
          `[IO.File]::WriteAllBytes($path, $prot)`,
      ),
      // Value goes over stdin, never argv.
      stdin: secret,
    }),
    get: ps(
      `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; ${path}; ` +
        `if (-not (Test-Path $path)) { exit 1 }; ` +
        `$prot = [IO.File]::ReadAllBytes($path); ` +
        `$bytes = [Security.Cryptography.ProtectedData]::Unprotect($prot, $null, ` +
        `[Security.Cryptography.DataProtectionScope]::CurrentUser); ` +
        `[Console]::Out.Write([Text.Encoding]::UTF8.GetString($bytes))`,
    ),
    delete: ps(`${path}; Remove-Item -Force -ErrorAction SilentlyContinue $path`),
  };
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

/** A clear, actionable message naming the tool the platform's credential store needs. */
function keychainSetError(platform: NodeJS.Platform): string {
  switch (platform) {
    case 'win32':
      return 'Failed to store the session via Windows DPAPI. Ensure Windows PowerShell (powershell.exe) is on your PATH.';
    case 'darwin':
      return 'Failed to store the session in the macOS Keychain (the `security` tool is required).';
    default:
      return 'Failed to store the session in the OS keyring. Install libsecret (the `secret-tool` command) and try again.';
  }
}

/** The default backend: the platform's native credential store. */
export function osKeychainBackend(platform: NodeJS.Platform = process.platform): KeychainBackend {
  const cmds = (account: string) => keychainCommands(platform, account);
  return {
    async set(account, secret) {
      // A spawn failure (e.g. the credential tool is missing) rejects; a non-zero exit means the
      // tool ran but failed. Both surface as one clean, actionable error — never a raw stack trace.
      const { code } = await run(cmds(account).set(secret)).catch(() => ({ code: -1, stdout: '' }));
      if (code !== 0) throw new Error(keychainSetError(platform));
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
