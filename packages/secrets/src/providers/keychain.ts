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

export function keychainCommand(
  platform: NodeJS.Platform,
  service: string,
  account: string,
): { command: string; args: string[] } {
  switch (platform) {
    case 'darwin':
      return {
        command: 'security',
        args: ['find-generic-password', '-s', service, '-a', account, '-w'],
      };
    case 'win32':
      return {
        command: 'powershell',
        args: [
          '-NoProfile',
          '-Command',
          `(Get-StoredCredential -Target '${service}:${account}').GetNetworkCredential().Password`,
        ],
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
      const { command, args } = keychainCommand(platform, service, account);
      let result;
      try {
        // Thread the resolver's timeout signal through so a hung backend child is killed (S20.4).
        result = await exec(command, args, { signal: ctx?.signal });
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
