import { describe, expect, it } from 'vitest';
import { keychainCommand, keychainProvider } from '../src/providers/keychain.js';
import type { CommandExec } from '../src/exec.js';

describe('keychainCommand per-OS (S4.4)', () => {
  it('macOS uses `security`', () => {
    expect(keychainCommand('darwin', 'mcpfold', 'github')).toEqual({
      command: 'security',
      args: ['find-generic-password', '-s', 'mcpfold', '-a', 'github', '-w'],
    });
  });
  it('Linux uses `secret-tool`', () => {
    expect(keychainCommand('linux', 'mcpfold', 'github')).toEqual({
      command: 'secret-tool',
      args: ['lookup', 'service', 'mcpfold', 'account', 'github'],
    });
  });
  it('Windows uses PowerShell CredentialManager', () => {
    const { command, args } = keychainCommand('win32', 'mcpfold', 'github');
    expect(command).toBe('powershell');
    expect(args.join(' ')).toContain('Get-StoredCredential');
  });
});

describe('keychainProvider (S4.4)', () => {
  const okExec =
    (value: string): CommandExec =>
    async () => ({ code: 0, stdout: `${value}\n`, stderr: '' });

  it('resolves the value and strips the trailing newline', async () => {
    const provider = keychainProvider({ platform: 'darwin', exec: okExec('s3cr3t') });
    expect(await provider.resolve('github')).toBe('s3cr3t');
  });

  it('gives an actionable error when there is no entry (nonzero exit)', async () => {
    const exec: CommandExec = async () => ({ code: 44, stdout: '', stderr: 'not found' });
    const provider = keychainProvider({ platform: 'linux', exec });
    await expect(provider.resolve('missing')).rejects.toThrow(/no entry for "mcpfold:missing"/);
  });

  it('gives an actionable error when the backend binary is unavailable', async () => {
    const exec: CommandExec = async () => {
      throw new Error('ENOENT');
    };
    const provider = keychainProvider({ platform: 'linux', exec });
    await expect(provider.resolve('x')).rejects.toThrow(/backend "secret-tool" is not available/);
  });
});
