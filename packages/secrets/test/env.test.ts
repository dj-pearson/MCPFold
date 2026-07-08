import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { envProvider } from '../src/providers/env.js';
import { dotenvProvider, parseDotenv } from '../src/providers/dotenv.js';

describe('envProvider (S4.2)', () => {
  it('resolves from a given environment', async () => {
    const p = envProvider({ GITHUB_PAT: 'ghp_x' });
    expect(await p.resolve('GITHUB_PAT')).toBe('ghp_x');
  });
  it('errors clearly on a missing variable', async () => {
    await expect(envProvider({}).resolve('NOPE')).rejects.toThrow(/"NOPE" is not set/);
  });
});

describe('parseDotenv (S4.2)', () => {
  it('parses KEY=VALUE, comments, blanks, and quotes', () => {
    const parsed = parseDotenv(`
# a comment
TOKEN=abc123
QUOTED="with spaces"
SINGLE='sq'

EMPTY=
`);
    expect(parsed).toEqual({ TOKEN: 'abc123', QUOTED: 'with spaces', SINGLE: 'sq', EMPTY: '' });
  });
});

describe('dotenvProvider (S4.2)', () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('reads from a designated file without polluting process.env', async () => {
    dir = mkdtempSync(join(tmpdir(), 'mcpfold-dotenv-'));
    const file = join(dir, '.env');
    writeFileSync(file, 'SECRET_TOKEN=s3cr3t\n');
    const p = dotenvProvider(file);
    expect(await p.resolve('SECRET_TOKEN')).toBe('s3cr3t');
    // Crucially, it did NOT leak into the global environment.
    expect(process.env.SECRET_TOKEN).toBeUndefined();
  });

  it('errors on a missing key and on a missing file', async () => {
    dir = mkdtempSync(join(tmpdir(), 'mcpfold-dotenv-'));
    const file = join(dir, '.env');
    writeFileSync(file, 'A=1\n');
    await expect(dotenvProvider(file).resolve('B')).rejects.toThrow(/"B" not found/);
    await expect(dotenvProvider(join(dir, 'missing.env')).resolve('A')).rejects.toThrow(
      /could not read/,
    );
  });
});
