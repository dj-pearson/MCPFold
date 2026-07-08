import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UsageError } from '@mcpfold/core';
import { runMigrate } from '../src/commands/migrate.js';

let cwd: string;
beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'mcpfold-mig-'));
});
afterEach(() => rmSync(cwd, { recursive: true, force: true }));

const V1 = `{ "version": 1, "servers": {}, "profiles": {} }`;

describe('runMigrate (S0.7)', () => {
  it('is a no-op on a config already at the current version', () => {
    writeFileSync(join(cwd, 'mcp.config.jsonc'), V1);
    const result = runMigrate({ cwd });
    expect(result.data.changed).toBe(false);
    expect(result.data.applied).toEqual([]);
    expect(result.human).toContain('already at version');
    // File untouched, no backup.
    expect(readFileSync(join(cwd, 'mcp.config.jsonc'), 'utf8')).toBe(V1);
    expect(result.data.backup).toBeNull();
  });

  it('errors when no config is present', () => {
    expect(() => runMigrate({ cwd })).toThrow(UsageError);
  });
});
