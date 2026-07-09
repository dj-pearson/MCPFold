import { MIGRATIONS, type Migration } from './migrations.js';

/**
 * Migration runner (S0.7). Detects an outdated `version`, applies migrations N→N+1 in
 * sequence up to the target, and returns the upgraded config. Pure — the CLI handles the
 * file I/O and backups.
 */

/** The config schema version this build of mcpfold supports. */
export const SCHEMA_VERSION = 2;

export class MigrationError extends Error {
  override readonly name = 'MigrationError';
}

/** Read the `version` field from an already-parsed config object. Defaults to 1 if absent. */
export function detectVersion(raw: unknown): number {
  if (
    raw &&
    typeof raw === 'object' &&
    typeof (raw as { version?: unknown }).version === 'number'
  ) {
    return (raw as { version: number }).version;
  }
  return 1;
}

export interface MigrateResult {
  config: Record<string, unknown>;
  fromVersion: number;
  toVersion: number;
  applied: string[];
}

/**
 * Migrate a parsed config object from its current version up to `targetVersion`
 * (default {@link SCHEMA_VERSION}). Throws if the config is already newer than the target
 * or if a step in the chain is missing.
 */
export function migrateConfig(
  raw: Record<string, unknown>,
  targetVersion: number = SCHEMA_VERSION,
  migrations: Migration[] = MIGRATIONS,
): MigrateResult {
  const fromVersion = detectVersion(raw);
  if (fromVersion > targetVersion) {
    throw new MigrationError(
      `config is version ${fromVersion}, newer than the target ${targetVersion}. Upgrade mcpfold.`,
    );
  }
  let config: Record<string, unknown> = { ...raw };
  const applied: string[] = [];
  let current = fromVersion;
  while (current < targetVersion) {
    const step = migrations.find((m) => m.from === current);
    if (!step) {
      throw new MigrationError(`no migration registered from version ${current} to ${current + 1}`);
    }
    config = step.migrate(config);
    applied.push(step.description);
    current = step.to;
  }
  return { config, fromVersion, toVersion: current, applied };
}
