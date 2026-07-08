import { describe, expect, it } from 'vitest';
import { escapeCmdArgument, resolveCommand } from '../src/util/spawn.js';

/**
 * S16.2 — the resolver must make bare npx/uvx/node launch on Windows without a shell around
 * untrusted args, and be a strict no-op on POSIX. Windows behavior is exercised on any host by
 * injecting `platform: 'win32'` plus a fake env + filesystem.
 */

// A fake win32 filesystem: a set of files that "exist".
const fakeFs = (...files: string[]) => {
  const set = new Set(files.map((f) => f.toLowerCase()));
  return (p: string) => set.has(p.toLowerCase());
};

const WIN_ENV = {
  PATHEXT: '.COM;.EXE;.BAT;.CMD',
  Path: 'C:\\Windows\\System32;C:\\Users\\me\\AppData\\Roaming\\npm',
  ComSpec: 'C:\\Windows\\System32\\cmd.exe',
};

describe('resolveCommand — POSIX passthrough', () => {
  for (const platform of ['darwin', 'linux'] as const) {
    it(`is a no-op on ${platform}`, () => {
      const r = resolveCommand('npx', ['-y', 'some-server'], { platform });
      expect(r.command).toBe('npx');
      expect(r.args).toEqual(['-y', 'some-server']);
      expect(r.windowsVerbatimArguments).toBe(false);
    });
  }
});

describe('resolveCommand — win32', () => {
  it('resolves a bare npx to npx.cmd on PATH and wraps it in cmd.exe', () => {
    const r = resolveCommand('npx', ['-y', 'server'], {
      platform: 'win32',
      env: WIN_ENV,
      fileExists: fakeFs('C:\\Users\\me\\AppData\\Roaming\\npm\\npx.cmd'),
    });
    expect(r.command).toBe('C:\\Windows\\System32\\cmd.exe');
    expect(r.windowsVerbatimArguments).toBe(true);
    // The resolved .cmd path and its args are embedded, escaped, in the /c line.
    expect(r.args.slice(0, 3)).toEqual(['/d', '/s', '/c']);
    expect(r.args[3]!.toLowerCase()).toContain('npx.cmd');
    expect(r.args[3]).toContain('server');
  });

  it('resolves a bare node to node.exe and runs it directly (no shell wrap)', () => {
    const r = resolveCommand('node', ['index.js'], {
      platform: 'win32',
      env: WIN_ENV,
      fileExists: fakeFs('C:\\Windows\\System32\\node.exe'),
    });
    expect(r.command.toLowerCase()).toBe('c:\\windows\\system32\\node.exe');
    expect(r.args).toEqual(['index.js']);
    expect(r.windowsVerbatimArguments).toBe(false);
  });

  it('appends the right PATHEXT extension (uvx → uvx.exe)', () => {
    const r = resolveCommand('uvx', ['mcp-server-fetch'], {
      platform: 'win32',
      env: WIN_ENV,
      fileExists: fakeFs('C:\\Users\\me\\AppData\\Roaming\\npm\\uvx.exe'),
    });
    expect(r.command.toLowerCase()).toBe('c:\\users\\me\\appdata\\roaming\\npm\\uvx.exe');
    expect(r.windowsVerbatimArguments).toBe(false);
  });

  it('falls back to the bare command when nothing resolves on PATH', () => {
    const r = resolveCommand('does-not-exist', ['x'], {
      platform: 'win32',
      env: WIN_ENV,
      fileExists: fakeFs(),
    });
    expect(r.command).toBe('does-not-exist');
    expect(r.args).toEqual(['x']);
    expect(r.windowsVerbatimArguments).toBe(false);
  });

  it('honors an explicit .cmd path without searching PATH', () => {
    const r = resolveCommand('C:\\tools\\my-server.cmd', ['--flag'], {
      platform: 'win32',
      env: WIN_ENV,
      fileExists: fakeFs('C:\\tools\\my-server.cmd'),
    });
    expect(r.command).toBe('C:\\Windows\\System32\\cmd.exe');
    expect(r.windowsVerbatimArguments).toBe(true);
    expect(r.args[3]).toContain('my-server.cmd');
  });
});

describe('escapeCmdArgument — untrusted args never reach a shell', () => {
  it('quotes plain args', () => {
    expect(escapeCmdArgument('server')).toBe('^"server^"');
  });

  it('neutralizes cmd meta-characters', () => {
    // & would chain commands if unescaped; each meta char is prefixed with ^.
    const escaped = escapeCmdArgument('a&b|c');
    expect(escaped).toContain('^&');
    expect(escaped).toContain('^|');
  });

  it('escapes embedded double quotes', () => {
    expect(escapeCmdArgument('say "hi"')).toContain('\\^"');
  });
});
