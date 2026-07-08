import { defaultExec, type CommandExec } from '../exec.js';
import type { SecretProvider } from '../types.js';

/**
 * 1Password provider (S4.5) — resolves `${op:vault/item/field}` by shelling out to the `op`
 * CLI (`op read op://vault/item/field`). The CLI must be installed and signed in; a
 * missing/locked CLI produces an actionable message. Secret values are never logged. The
 * `op` invocation is injectable for tests.
 */

export interface OpConfig {
  exec?: CommandExec;
}

export function opReference(path: string): string {
  return `op://${path.replace(/^op:\/\//, '')}`;
}

export function opProvider(config: OpConfig = {}): SecretProvider {
  const exec = config.exec ?? defaultExec;
  return {
    scheme: 'op',
    async resolve(path) {
      const reference = opReference(path);
      let result;
      try {
        result = await exec('op', ['read', reference]);
      } catch {
        throw new Error(
          'the 1Password CLI `op` is not installed or not on PATH — install it from https://developer.1password.com/docs/cli',
        );
      }
      if (result.code !== 0) {
        const hint = /not signed in|authorization|sign in/i.test(result.stderr)
          ? 'run `op signin` first'
          : `check that "${reference}" exists`;
        throw new Error(`op could not read "${reference}" (${hint})`);
      }
      return result.stdout.replace(/\r?\n$/, '');
    },
  };
}
