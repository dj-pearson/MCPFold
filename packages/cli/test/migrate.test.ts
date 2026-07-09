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

const V2 = `{ "version": 2, "servers": {}, "profiles": {} }`;
const V1_HTTP = `{ "version": 1, "servers": { "gh": { "transport": "http", "url": "https://x/mcp", "tags": [] } }, "profiles": {} }`;

describe('runMigrate (S0.7, S17.5)', () => {
  it('is a no-op on a config already at the current version', () => {
    writeFileSync(join(cwd, 'mcp.config.jsonc'), V2);
    const result = runMigrate({ cwd });
    expect(result.data.changed).toBe(false);
    expect(result.data.applied).toEqual([]);
    expect(result.human).toContain('already at version');
    // File untouched, no backup.
    expect(readFileSync(join(cwd, 'mcp.config.jsonc'), 'utf8')).toBe(V2);
    expect(result.data.backup).toBeNull();
  });

  it('upgrades a v1 file to v2, canonicalizing http → streamable-http (S17.5)', () => {
    writeFileSync(join(cwd, 'mcp.config.jsonc'), V1_HTTP);
    const result = runMigrate({ cwd });
    expect(result.data.changed).toBe(true);
    expect(result.data.fromVersion).toBe(1);
    expect(result.data.toVersion).toBe(2);
    expect(result.data.backup).not.toBeNull(); // the original is backed up
    const upgraded = readFileSync(join(cwd, 'mcp.config.jsonc'), 'utf8');
    expect(upgraded).toContain('"version": 2');
    expect(upgraded).toContain('streamable-http');
    expect(upgraded).not.toMatch(/"transport":\s*"http"/);
  });

  it('errors when no config is present', () => {
    expect(() => runMigrate({ cwd })).toThrow(UsageError);
  });
});
