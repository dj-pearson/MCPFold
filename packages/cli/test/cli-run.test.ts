import { describe, expect, it } from 'vitest';
import { run, parseIntFlag } from '../src/cli.js';
import { UsageError } from '@mcpfold/core';
import { EXIT } from '../src/output/exit-codes.js';
import type { Writer } from '../src/output/render.js';
import type { JsonEnvelope } from '../src/output/envelope.js';

function capture(): { writer: Writer; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { writer: { out: (t) => out.push(t), err: (t) => err.push(t) }, out, err };
}

describe('run() — real arg parsing (guards option placement)', () => {
  it('accepts --json AFTER the subcommand (mcpfold diagnose --json)', async () => {
    const { writer, out } = capture();
    const code = await run(['diagnose', '--json'], writer);
    expect(code).toBe(EXIT.SUCCESS);
    const env = JSON.parse(out.join('')) as JsonEnvelope;
    expect(env.ok).toBe(true);
    expect(env.command).toBe('diagnose');
  });

  it('accepts --json BEFORE the subcommand (mcpfold --json diagnose)', async () => {
    const { writer, out } = capture();
    const code = await run(['--json', 'diagnose'], writer);
    expect(code).toBe(EXIT.SUCCESS);
    expect(out.join('')).toContain('"envelopeVersion"');
  });

  it('diagnose without --json prints human output, no envelope', async () => {
    const { writer, out } = capture();
    const code = await run(['diagnose'], writer);
    expect(code).toBe(EXIT.SUCCESS);
    expect(out.join('')).toContain('mcpfold diagnostic bundle');
    expect(out.join('')).not.toContain('envelopeVersion');
  });

  it('sync without a config exits 2 (usage error), pointing at init', async () => {
    const { writer, out } = capture();
    const code = await run(
      ['sync', '--check', '--cwd', '/nonexistent-mcpfold-dir', '--json'],
      writer,
    );
    expect(code).toBe(EXIT.ERROR);
    const env = JSON.parse(out.join(''));
    expect(env.ok).toBe(false);
    expect(env.errors[0].code).toBe('USAGE');
  });

  it('lists all spec §8 commands in --help', async () => {
    const { writer, out, err } = capture();
    // exitOverride throws helpDisplayed; run() maps it to SUCCESS.
    await run(['--help'], writer);
    const help = out.join('') + err.join('');
    for (const name of [
      'init',
      'import',
      'export',
      'add',
      'search',
      'sync',
      'diff',
      'doctor',
      'secret',
      'run',
      'login',
      'push',
      'pull',
    ]) {
      expect(help).toContain(name);
    }
  });
});

describe('parseIntFlag (S22.21)', () => {
  it('accepts a valid positive integer and undefined', () => {
    expect(parseIntFlag('--limit', '20')).toBe(20);
    expect(parseIntFlag('--limit', undefined)).toBeUndefined();
  });

  it('rejects NaN, negatives, and non-integers with a UsageError', () => {
    expect(() => parseIntFlag('--limit', 'abc')).toThrow(UsageError);
    expect(() => parseIntFlag('--limit', '-3')).toThrow(UsageError);
    expect(() => parseIntFlag('--config-version', '1.5')).toThrow(/integer/);
    expect(() => parseIntFlag('--limit', '3.0e2')).not.toThrow(); // 300 is an integer
  });
});
