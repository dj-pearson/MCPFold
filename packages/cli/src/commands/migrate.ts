import { readFileSync } from 'node:fs';
import { parse as parseJsonc } from 'jsonc-parser';
import { detectVersion, migrateConfig, serialize, SCHEMA_VERSION, UsageError } from '@mcpfold/core';
import { findConfigPath } from '../util/config.js';
import { atomicWrite } from '../io/atomic-write.js';
import { backupIfExists } from '../io/backup.js';
import { EXIT } from '../output/exit-codes.js';
import type { CommandOutput } from '../output/render.js';

/**
 * `mcpfold migrate` (S0.7) — detect an outdated config `version`, back it up, apply the
 * registered migrations in sequence, and write the upgraded config. A config already at the
 * current version is a no-op. Comments are preserved best-effort (the upgraded file is
 * re-serialized deterministically; complex comment-preserving edits are out of scope).
 */

export interface MigrateData {
  configPath: string;
  fromVersion: number;
  toVersion: number;
  applied: string[];
  backup: string | null;
  changed: boolean;
}

export interface MigrateOptions {
  cwd: string;
  dryRun?: boolean;
  now?: Date;
}

export function runMigrate(options: MigrateOptions): CommandOutput<MigrateData> {
  const configPath = findConfigPath(options.cwd);
  if (!configPath) {
    throw new UsageError(`No mcp.config.jsonc found in ${options.cwd}.`, {
      hint: 'Run `mcpfold init` to scaffold one.',
    });
  }

  const text = readFileSync(configPath, 'utf8');
  const raw = parseJsonc(text) as Record<string, unknown>;
  const fromVersion = detectVersion(raw);

  if (fromVersion === SCHEMA_VERSION) {
    return {
      data: {
        configPath,
        fromVersion,
        toVersion: fromVersion,
        applied: [],
        backup: null,
        changed: false,
      },
      human: `✓ ${configPath} is already at version ${SCHEMA_VERSION}. Nothing to migrate.`,
    };
  }

  const result = migrateConfig(raw, SCHEMA_VERSION);
  const upgraded = serialize(result.config);

  if (options.dryRun) {
    return {
      data: {
        configPath,
        fromVersion: result.fromVersion,
        toVersion: result.toVersion,
        applied: result.applied,
        backup: null,
        changed: true,
      },
      human: [
        `Would migrate ${configPath}: v${result.fromVersion} → v${result.toVersion}`,
        ...result.applied.map((a) => `  • ${a}`),
        '',
        upgraded,
      ].join('\n'),
    };
  }

  const backup = backupIfExists(configPath, options.now);
  atomicWrite(configPath, upgraded);
  return {
    data: {
      configPath,
      fromVersion: result.fromVersion,
      toVersion: result.toVersion,
      applied: result.applied,
      backup,
      changed: true,
    },
    human: [
      `Migrated ${configPath}: v${result.fromVersion} → v${result.toVersion}`,
      ...result.applied.map((a) => `  • ${a}`),
      backup ? `Backup: ${backup}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    exit: EXIT.SUCCESS,
  };
}
