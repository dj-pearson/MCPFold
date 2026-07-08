import { describe, expect, it, vi } from 'vitest';
import { opProvider, opReference } from '../src/providers/op.js';
import type { CommandExec } from '../src/exec.js';

describe('opReference (S4.5)', () => {
  it('builds an op:// reference and tolerates an existing prefix', () => {
    expect(opReference('vault/item/field')).toBe('op://vault/item/field');
    expect(opReference('op://vault/item/field')).toBe('op://vault/item/field');
  });
});

describe('opProvider (S4.5)', () => {
  it('resolves via `op read` (mocked), trimming the newline', async () => {
    const exec = vi.fn<CommandExec>(async (cmd, args) => {
      expect(cmd).toBe('op');
      expect(args).toEqual(['read', 'op://vault/item/field']);
      return { code: 0, stdout: 'the-secret\n', stderr: '' };
    });
    const provider = opProvider({ exec });
    expect(await provider.resolve('vault/item/field')).toBe('the-secret');
  });

  it('detects a missing op CLI with an install hint', async () => {
    const exec: CommandExec = async () => {
      throw new Error('ENOENT');
    };
    await expect(opProvider({ exec }).resolve('v/i/f')).rejects.toThrow(/`op` is not installed/);
  });

  it('detects a locked/not-signed-in CLI and says to sign in', async () => {
    const exec: CommandExec = async () => ({
      code: 1,
      stdout: '',
      stderr: 'you are not signed in',
    });
    await expect(opProvider({ exec }).resolve('v/i/f')).rejects.toThrow(/op signin/);
  });

  it('never includes the secret value in an error message', async () => {
    const exec: CommandExec = async () => ({ code: 1, stdout: '', stderr: 'item not found' });
    await expect(opProvider({ exec }).resolve('v/i/f')).rejects.toThrow(
      /check that "op:\/\/v\/i\/f" exists/,
    );
  });
});
