import { join } from 'node:path';
import { envProvider } from './providers/env.js';
import { dotenvProvider } from './providers/dotenv.js';
import type { SecretProvider } from './types.js';

/**
 * @mcpfold/secrets — secret providers and the fail-closed resolver. Impure by design
 * (env/fs/network); injected into the pure core.
 */

export type { SecretProvider, SecretResolveContext } from './types.js';
export { resolveSecrets, DEFAULT_TIMEOUT_MS, type ResolveOptions } from './resolver.js';
export { envProvider } from './providers/env.js';
export { dotenvProvider, parseDotenv } from './providers/dotenv.js';

/**
 * The day-1 default providers (S4.2): `env` (process env) and `dotenv` (`<cwd>/.env`).
 * Later providers (infisical, keychain, op) are added as they land.
 */
export function defaultProviders(cwd: string = process.cwd()): SecretProvider[] {
  return [envProvider(), dotenvProvider(join(cwd, '.env'))];
}
