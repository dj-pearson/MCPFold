import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '@mcpfold/core';
import type { OsContext } from '@mcpfold/adapters';
import { runInit } from '../src/commands/init.js';
import { UsageError } from '@mcpfold/core';

let cwd: string;
const ctx: OsContext = { platform: 'linux', home: '/home/nobody', env: {} };

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'mcpfold-init-'));
});
afterEach(() => rmSync(cwd, { recursive: true, force: true }));

describe('runInit (S3.2)', () => {
  it('creates a valid mcp.config.jsonc that loadConfig accepts', () => {
    const result = runInit({ cwd, osContext: ctx });
    const path = join(cwd, 'mcp.config.jsonc');
    expect(existsSync(path)).toBe(true);
    expect(result.data.created).toBe(true);
    const loaded = loadConfig(readFileSync(path, 'utf8'));
    expect(loaded.ok).toBe(true);
  });

  it('includes a $schema line for editor autocomplete', () => {
    runInit({ cwd, osContext: ctx });
    expect(readFileSync(join(cwd, 'mcp.config.jsonc'), 'utf8')).toContain('"$schema"');
  });

  it('refuses to overwrite an existing config without --force', () => {
    runInit({ cwd, osContext: ctx });
    expect(() => runInit({ cwd, osContext: ctx })).toThrow(UsageError);
  });

  it('--force overwrites', () => {
    runInit({ cwd, osContext: ctx });
    expect(() => runInit({ cwd, force: true, osContext: ctx })).not.toThrow();
  });

  it('--dry-run writes nothing', () => {
    const result = runInit({ cwd, dryRun: true, osContext: ctx });
    expect(existsSync(join(cwd, 'mcp.config.jsonc'))).toBe(false);
    expect(result.data.created).toBe(false);
    expect(result.human).toContain('Would create');
  });

  it('reports detected clients', () => {
    const result = runInit({ cwd, osContext: ctx });
    // /home/nobody has no client files → none detected, but the field is present.
    expect(Array.isArray(result.data.detected)).toBe(true);
    expect(result.data.detected.every((c) => c.installed === false)).toBe(true);
  });
});
