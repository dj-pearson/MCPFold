import { defaultExec, type CommandExec } from '../exec.js';
import type { SecretProvider } from '../types.js';

/**
 * OS keychain provider (S4.4) — resolves `${keychain:account}` from the platform's native
 * secret store under a fixed service name (`mcpfold` by default):
 *   - macOS:   `security find-generic-password -s <service> -a <account> -w`
 *   - Linux:   `secret-tool lookup service <service> account <account>` (libsecret)
 *   - Windows: PowerShell + the CredentialManager module (`Get-StoredCredential`)
 *
 * Store a value with `mcpfold secret set` (or the OS tool directly). The backend call is
 * injectable for tests.
 */

export interface KeychainConfig {
  platform?: NodeJS.Platform;
  service?: string;
  exec?: CommandExec;
}

export interface KeychainCommand {
  command: string;
  args: string[];
  /**
   * Extra env for the child (win32 only). The service/account are passed here rather than
   * interpolated into the PowerShell `-Command` text, so a `${keychain:...}` account laden with
   * quotes/`;`/`$(...)`/backticks resolves as a literal lookup key and cannot execute code (S22.1).
   */
  env?: Record<string, string>;
}

export function keychainCommand(
  platform: NodeJS.Platform,
  service: string,
  account: string,
): KeychainCommand {
  switch (platform) {
    case 'darwin':
      return {
        command: 'security',
        args: ['find-generic-password', '-s', service, '-a', account, '-w'],
      };
    case 'win32':
      // The script is a CONSTANT — it reads the target from env vars, which PowerShell treats as
      // opaque string data (never parsed as code). The untrusted account therefore never enters the
      // command text, closing the string-interpolation injection. `-NonInteractive` keeps a
      // malformed value from ever blocking on a prompt.
      return {
        command: 'powershell',
        args: [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          "(Get-StoredCredential -Target ($env:MCPFOLD_KC_SERVICE + ':' + $env:MCPFOLD_KC_ACCOUNT)).GetNetworkCredential().Password",
        ],
        env: { MCPFOLD_KC_SERVICE: service, MCPFOLD_KC_ACCOUNT: account },
      };
    default: // linux / libsecret
      return { command: 'secret-tool', args: ['lookup', 'service', service, 'account', account] };
  }
}

export function keychainProvider(config: KeychainConfig = {}): SecretProvider {
  const platform = config.platform ?? process.platform;
  const service = config.service ?? 'mcpfold';
  const exec = config.exec ?? defaultExec;
  return {
    scheme: 'keychain',
    async resolve(account, ctx) {
      const { command, args, env } = keychainCommand(platform, service, account);
      let result;
      try {
        // Thread the resolver's timeout signal through so a hung backend child is killed (S20.4).
        // `env` carries the win32 lookup target out-of-band (S22.1); undefined elsewhere.
        result = await exec(command, args, { signal: ctx?.signal, env });
      } catch {
        throw new Error(
          `keychain backend "${command}" is not available — install it (macOS: built-in; ` +
            `Linux: libsecret/secret-tool; Windows: CredentialManager module) or use a different provider`,
        );
      }
      if (result.code !== 0) {
        throw new Error(
          `keychain has no entry for "${service}:${account}" (store it with \`mcpfold secret set\`)`,
        );
      }
      // `security -w` and secret-tool return a trailing newline.
      return result.stdout.replace(/\r?\n$/, '');
    },
  };
}
