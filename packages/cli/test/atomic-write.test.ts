import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { atomicWrite, tempName } from '../src/io/atomic-write.js';

describe('atomicWrite (S3.5, S16.7)', () => {
  let dir: string;
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes the target and leaves no temp file behind on success', () => {
    dir = mkdtempSync(join(tmpdir(), 'mcpfold-aw-'));
    const target = join(dir, 'mcp.json');
    atomicWrite(target, '{"ok":true}');
    expect(readFileSync(target, 'utf8')).toBe('{"ok":true}');
    expect(tempFiles(dir)).toHaveLength(0);
  });

  it('creates missing parent directories', () => {
    dir = mkdtempSync(join(tmpdir(), 'mcpfold-aw-'));
    const target = join(dir, 'nested', 'deep', 'mcp.json');
    atomicWrite(target, 'x');
    expect(readFileSync(target, 'utf8')).toBe('x');
  });

  it('writes the target 0600 on POSIX', () => {
    dir = mkdtempSync(join(tmpdir(), 'mcpfold-aw-'));
    const target = join(dir, 'mcp.json');
    atomicWrite(target, 'secret');
    if (process.platform !== 'win32') {
      expect(statSync(target).mode & 0o777).toBe(0o600);
    }
  });

  it('generates a unique, hidden, gitignore-matching temp name per call (S16.7)', () => {
    // Assert the collision-safety invariant on the name generator directly: node:fs
    // named exports can't be spied on under ESM, so we exercise tempName itself.
    const names = Array.from({ length: 1000 }, () => tempName('mcp.json'));
    expect(new Set(names).size).toBe(1000); // all distinct
    for (const name of names) {
      expect(name.startsWith('.mcp.json.')).toBe(true); // hidden dot-prefix + basename
      expect(name.endsWith('.mcpfold.tmp')).toBe(true); // matches gitignore *.mcpfold.tmp
      expect(name).not.toBe('mcp.json'); // never collides with the target basename
    }
  });

  it('keeps writes intact and temp-free across many sequential writes (S16.7)', () => {
    dir = mkdtempSync(join(tmpdir(), 'mcpfold-aw-'));
    const target = join(dir, 'mcp.json');
    for (let i = 0; i < 25; i++) atomicWrite(target, `v${i}`);
    expect(readFileSync(target, 'utf8')).toBe('v24');
    expect(tempFiles(dir)).toHaveLength(0);
  });

  it('overlapping writes to the same target never leave a partial file', async () => {
    dir = mkdtempSync(join(tmpdir(), 'mcpfold-aw-'));
    const target = join(dir, 'mcp.json');
    const values = Array.from({ length: 30 }, (_, i) => JSON.stringify({ n: i }));
    await Promise.all(values.map((v) => Promise.resolve().then(() => atomicWrite(target, v))));
    // The target is exactly one of the written values in full — never a partial mix.
    expect(values).toContain(readFileSync(target, 'utf8'));
    expect(tempFiles(dir)).toHaveLength(0);
  });

  it('cleans up the temp file and rethrows when the rename fails', () => {
    dir = mkdtempSync(join(tmpdir(), 'mcpfold-aw-'));
    // Make the target an existing non-empty directory. writeFileSync creates the temp
    // file fine, but renaming a file over a non-empty directory fails on every OS — so
    // the catch/cleanup branch runs with a real temp file on disk.
    const target = join(dir, 'mcp.json');
    mkdirSync(target);
    writeFileSync(join(target, 'inner'), 'x');
    expect(() => atomicWrite(target, 'nope')).toThrow();
    // The half-written temp file is cleaned up; the directory target is untouched.
    expect(tempFiles(dir)).toHaveLength(0);
    expect(statSync(target).isDirectory()).toBe(true);
    expect(readFileSync(join(target, 'inner'), 'utf8')).toBe('x');
  });

  // S22.20: a symlinked config is FOLLOWED — the write goes through the link, preserving it.
  // Skipped on win32 where symlinkSync needs elevated privileges.
  it.skipIf(process.platform === 'win32')('follows a symlinked target and preserves the link', () => {
    dir = mkdtempSync(join(tmpdir(), 'mcpfold-aw-'));
    const real = join(dir, 'real.json');
    const link = join(dir, 'config.json');
    writeFileSync(real, '{"old":true}');
    symlinkSync(real, link);

    atomicWrite(link, '{"new":true}');

    // The link is still a symlink (not replaced by a regular file)...
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    // ...and its real target received the new content.
    expect(readFileSync(real, 'utf8')).toBe('{"new":true}');
    expect(readFileSync(link, 'utf8')).toBe('{"new":true}');
    expect(tempFiles(dir)).toHaveLength(0);
  });
});

function tempFiles(dir: string): string[] {
  return readdirSync(dir).filter((f) => f.includes('.mcpfold.tmp'));
}
