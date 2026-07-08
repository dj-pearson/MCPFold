import type { SecretProvider } from '../types.js';

/**
 * `env` provider (S4.2) — resolves `${env:NAME}` from the process environment. A missing
 * variable is a clear, fail-closed error. Writes secret values nowhere.
 */
export function envProvider(env: NodeJS.ProcessEnv = process.env): SecretProvider {
  return {
    scheme: 'env',
    async resolve(path) {
      const value = env[path];
      if (value === undefined) {
        throw new Error(`environment variable "${path}" is not set`);
      }
      return value;
    },
  };
}
