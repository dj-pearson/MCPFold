import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  findConfigPath,
  findConfigPathUpward,
  loadConfigFromDisk,
  upwardSearchDirs,
} from '../src/util/config.js';

/**
 * Config resolution (S24.2). `mcpfold run`, launched by a GUI client from an arbitrary cwd, must
 * still find the canonical config: sync embeds `--cwd <configDir>` (exact dir searched first), but a
 * bare shim falls back to an upward walk. Other commands keep exact-directory resolution.
 */

const CONFIG = '{ "version": 1, "servers": {}, "profiles": {} }';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'mcpfold-config-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('findConfigPathUpward (S24.2)', () => {
  it('finds a config in the start directory (nearest wins)', () => {
    writeFileSync(join(root, 'mcp.config.jsonc'), CONFIG);
    expect(findConfigPathUpward(root)).toBe(join(root, 'mcp.config.jsonc'));
  });

  it('walks up to a parent directory when the start dir has none', () => {
    const nested = join(root, 'a', 'b', 'c');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(root, 'mcp.config.jsonc'), CONFIG);
    expect(findConfigPathUpward(nested)).toBe(join(root, 'mcp.config.jsonc'));
  });

  it('prefers the nearest config over an ancestor one', () => {
    const nested = join(root, 'a', 'b');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(root, 'mcp.config.jsonc'), CONFIG);
    writeFileSync(join(root, 'a', 'mcp.config.jsonc'), CONFIG);
    expect(findConfigPathUpward(nested)).toBe(join(root, 'a', 'mcp.config.jsonc'));
  });

  it('returns null when no config exists up to the filesystem root', () => {
    const nested = join(root, 'a', 'b');
    mkdirSync(nested, { recursive: true });
    expect(findConfigPathUpward(nested)).toBeNull();
  });

  it('exact-directory findConfigPath does NOT walk up (behavior unchanged)', () => {
    const nested = join(root, 'a');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(root, 'mcp.config.jsonc'), CONFIG);
    expect(findConfigPath(nested)).toBeNull();
  });
});

describe('upwardSearchDirs (S24.2)', () => {
  it('lists the start dir first and terminates at the filesystem root', () => {
    const nested = join(root, 'a', 'b');
    const dirs = upwardSearchDirs(nested);
    expect(dirs[0]).toBe(nested);
    expect(dirs).toContain(root);
    // A fixed point (root) terminates the walk — no infinite loop.
    expect(dirs[dirs.length - 1]).toBe(dirname(dirs[dirs.length - 1]!));
  });
});

describe('loadConfigFromDisk upward error (S24.2)', () => {
  it('names every searched directory when nothing is found', () => {
    const nested = join(root, 'a', 'b');
    mkdirSync(nested, { recursive: true });
    try {
      loadConfigFromDisk(nested, { upward: true });
      throw new Error('expected loadConfigFromDisk to throw');
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain('No mcp.config.jsonc found');
      expect(message).toContain('Searched:');
      expect(message).toContain(nested);
      expect(message).toContain(root);
    }
  });
});
