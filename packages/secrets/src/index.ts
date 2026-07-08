import { join } from 'node:path';
import { envProvider } from './providers/env.js';
import { dotenvProvider } from './providers/dotenv.js';
import { infisicalProvider } from './providers/infisical.js';
import { keychainProvider } from './providers/keychain.js';
import { opProvider } from './providers/op.js';
import type { SecretProvider } from './types.js';

/**
 * @mcpfold/secrets — secret providers and the fail-closed resolver. Impure by design
 * (env/fs/network); injected into the pure core.
 */

export type { SecretProvider, SecretResolveContext } from './types.js';
export { resolveSecrets, DEFAULT_TIMEOUT_MS, type ResolveOptions } from './resolver.js';
export { defaultExec, type CommandExec, type ExecResult } from './exec.js';
export { envProvider } from './providers/env.js';
export { dotenvProvider, parseDotenv } from './providers/dotenv.js';
export {
  infisicalProvider,
  parseInfisicalPath,
  type InfisicalConfig,
  type InfisicalFetch,
  type InfisicalFetchParams,
} from './providers/infisical.js';
export { keychainProvider, keychainCommand, type KeychainConfig } from './providers/keychain.js';
export { opProvider, opReference, type OpConfig } from './providers/op.js';

/**
 * All built-in providers (spec §6 order): env, dotenv, infisical, keychain, op. Each is
 * registered so any `${scheme:path}` resolves; providers that need configuration fail with
 * an actionable message at resolve time rather than "no provider for scheme".
 */
export function defaultProviders(cwd: string = process.cwd()): SecretProvider[] {
  return [
    envProvider(),
    dotenvProvider(join(cwd, '.env')),
    infisicalProvider(),
    keychainProvider(),
    opProvider(),
  ];
}
