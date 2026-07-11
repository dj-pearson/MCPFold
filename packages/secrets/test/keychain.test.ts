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

  it('Windows passes the target out-of-band via env, never into the -Command text (S22.1)', () => {
    const { args, env } = keychainCommand('win32', 'mcpfold', 'github');
    // The account/service live in env, so PowerShell reads them as opaque data.
    expect(env).toEqual({ MCPFOLD_KC_SERVICE: 'mcpfold', MCPFOLD_KC_ACCOUNT: 'github' });
    // The script never mentions the concrete account/service value.
    expect(args.join(' ')).not.toContain('github');
  });

  it('Windows: an injection-laden account cannot alter the argv (S22.1)', () => {
    const payload = "x'); Start-Process calc; ('";
    const benign = keychainCommand('win32', 'mcpfold', 'github');
    const attack = keychainCommand('win32', 'mcpfold', payload);
    // The -Command script (argv) is a CONSTANT — identical regardless of the account.
    expect(attack.command).toBe(benign.command);
    expect(attack.args).toEqual(benign.args);
    // The metacharacter payload appears ONLY as literal env data, never in the executed script.
    expect(attack.args.join(' ')).not.toContain('Start-Process');
    expect(attack.args.join(' ')).not.toContain(payload);
    expect(attack.env?.MCPFOLD_KC_ACCOUNT).toBe(payload);
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

  it('win32: a normal account still resolves (behavior parity, S22.1)', async () => {
    const provider = keychainProvider({ platform: 'win32', exec: okExec('s3cr3t') });
    expect(await provider.resolve('github')).toBe('s3cr3t');
  });

  it('win32: an injection-payload account executes no extra command (S22.1)', async () => {
    const calls: { command: string; args: string[]; env?: Record<string, string> }[] = [];
    const exec: CommandExec = async (command, args, options) => {
      calls.push({ command, args, env: options?.env });
      return { code: 0, stdout: 'value\n', stderr: '' };
    };
    const payload = "x'); Start-Process calc; ('";
    const provider = keychainProvider({ platform: 'win32', exec });
    await provider.resolve(payload);
    // Exactly one command invoked; its argv carries no trace of the payload — only env does.
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.command).toBe('powershell');
    expect(call.args.join(' ')).not.toContain('Start-Process');
    expect(call.args.join(' ')).not.toContain(payload);
    expect(call.env?.MCPFOLD_KC_ACCOUNT).toBe(payload);
  });
});
