import { describe, expect, it } from 'vitest';
import { expandHome, joinFor, userConfigDir } from '../src/paths.js';
import type { OsContext } from '../src/types.js';

const ctx = (platform: NodeJS.Platform, env: NodeJS.ProcessEnv = {}): OsContext => ({
  platform,
  home: platform === 'win32' ? 'C:\\Users\\dev' : '/home/dev',
  env,
});

describe('expandHome (S2.1)', () => {
  it('expands a leading ~ (posix)', () => {
    expect(expandHome('~/repos/x', '/home/dev')).toBe('/home/dev/repos/x');
    expect(expandHome('~', '/home/dev')).toBe('/home/dev');
  });
  it('expands a leading ~ (windows-style backslash)', () => {
    expect(expandHome('~\\repos', 'C:\\Users\\dev')).toBe('C:\\Users\\dev\\repos');
  });
  it('leaves non-tilde paths untouched', () => {
    expect(expandHome('/abs/path', '/home/dev')).toBe('/abs/path');
    expect(expandHome('./rel', '/home/dev')).toBe('./rel');
  });
});

describe('userConfigDir per-OS (S2.1)', () => {
  it('linux → $XDG_CONFIG_HOME or ~/.config', () => {
    expect(userConfigDir(ctx('linux'))).toBe('/home/dev/.config');
    expect(userConfigDir(ctx('linux', { XDG_CONFIG_HOME: '/custom/cfg' }))).toBe('/custom/cfg');
  });
  it('darwin → ~/Library/Application Support', () => {
    expect(userConfigDir(ctx('darwin'))).toBe('/home/dev/Library/Application Support');
  });
  it('win32 → %APPDATA% or ~/AppData/Roaming (backslashes)', () => {
    expect(userConfigDir(ctx('win32'))).toBe('C:\\Users\\dev\\AppData\\Roaming');
    expect(userConfigDir(ctx('win32', { APPDATA: 'D:\\App' }))).toBe('D:\\App');
  });
});

describe('joinFor uses the platform separator (S2.1)', () => {
  it('posix vs win32', () => {
    expect(joinFor(ctx('linux'), 'a', 'b', 'c')).toBe('a/b/c');
    expect(joinFor(ctx('win32'), 'a', 'b', 'c')).toBe('a\\b\\c');
  });
});
