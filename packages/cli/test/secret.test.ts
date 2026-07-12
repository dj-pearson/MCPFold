import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { envProvider } from '@mcpfold/secrets';
import { runSecretSet, runSecretTest } from '../src/commands/secret.js';
import { EXIT } from '../src/output/exit-codes.js';

let cwd: string;
beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'mcpfold-secret-'));
});
afterEach(() => rmSync(cwd, { recursive: true, force: true }));

const SECRET_VALUE = 'sk-supersecret-should-never-print';

describe('secret test (S4.8)', () => {
  it('resolves a mocked ref and reports success WITHOUT printing the value', async () => {
    const result = await runSecretTest({
      cwd,
      ref: '${env:MY_TOKEN}',
      providers: [envProvider({ MY_TOKEN: SECRET_VALUE })],
    });
    expect(result.data.ok).toBe(true);
    expect(result.data.scheme).toBe('env');
    // The value must never appear in human OR data.
    expect(result.human).not.toContain(SECRET_VALUE);
    expect(JSON.stringify(result.data)).not.toContain(SECRET_VALUE);
  });

  it('reports failure (exit ERROR) for a missing secret, still no value', async () => {
    const result = await runSecretTest({
      cwd,
      ref: '${env:MISSING}',
      providers: [envProvider({})],
    });
    expect(result.data.ok).toBe(false);
    expect(result.exit).toBe(EXIT.ERROR);
    expect(result.human).not.toContain(SECRET_VALUE);
  });

  it('rejects a malformed reference', async () => {
    await expect(runSecretTest({ cwd, ref: 'not-a-ref', providers: [] })).rejects.toThrow(
      /not a valid/,
    );
  });
});

describe('secret set (S4.8)', () => {
  it('stores a dotenv value to .env without echoing it', () => {
    const result = runSecretSet({ cwd, ref: '${dotenv:GITHUB_PAT}', value: SECRET_VALUE });
    expect(result.data.stored).toBe(true);
    expect(result.human).not.toContain(SECRET_VALUE);
    // The value is written to .env (which the user must gitignore).
    expect(readFileSync(join(cwd, '.env'), 'utf8')).toContain(`GITHUB_PAT=${SECRET_VALUE}`);
  });

  it('for env, instructs the user to export rather than storing', () => {
    const result = runSecretSet({ cwd, ref: '${env:X}', value: SECRET_VALUE });
    expect(result.data.stored).toBe(false);
    expect(result.human).toContain('export X=');
    expect(result.human).not.toContain(SECRET_VALUE);
  });

  // S22.21: dotenv writes must be injection-safe and idempotent.
  it('upserts an existing key instead of appending a duplicate', () => {
    runSecretSet({ cwd, ref: '${dotenv:TOKEN}', value: 'old' });
    runSecretSet({ cwd, ref: '${dotenv:TOKEN}', value: 'new' });
    const env = readFileSync(join(cwd, '.env'), 'utf8');
    expect(env).toContain('TOKEN=new');
    expect(env).not.toContain('TOKEN=old');
    // Exactly one assignment to TOKEN (no stale duplicate masking).
    expect(env.match(/^TOKEN=/gm)?.length).toBe(1);
  });

  it('preserves other keys when upserting', () => {
    runSecretSet({ cwd, ref: '${dotenv:A}', value: '1' });
    runSecretSet({ cwd, ref: '${dotenv:B}', value: '2' });
    runSecretSet({ cwd, ref: '${dotenv:A}', value: '11' });
    const env = readFileSync(join(cwd, '.env'), 'utf8');
    expect(env).toContain('A=11');
    expect(env).toContain('B=2');
  });

  it('rejects a value containing a newline (line injection)', () => {
    expect(() => runSecretSet({ cwd, ref: '${dotenv:TOKEN}', value: 'x\nEVIL=injected' })).toThrow(
      /newline/i,
    );
  });

  it('a value may contain = but the key may not', () => {
    // A value with `=` is fine (dotenv splits on the first `=`).
    const result = runSecretSet({ cwd, ref: '${dotenv:TOKEN}', value: 'a=b=c' });
    expect(result.data.stored).toBe(true);
    expect(readFileSync(join(cwd, '.env'), 'utf8')).toContain('TOKEN=a=b=c');
  });
});
