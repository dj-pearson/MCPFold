import { describe, expect, it } from 'vitest';
import {
  ENVELOPE_VERSION,
  errorEnvelope,
  successEnvelope,
  toEnvelopeError,
  type JsonEnvelope,
} from '../src/output/envelope.js';
import { EXIT, exitCodeForError } from '../src/output/exit-codes.js';
import { runCommand, type CommandOutput, type Writer } from '../src/output/render.js';
import { diagnose } from '../src/commands/diagnose.js';
import { runSyncCheck } from '../src/commands/sync.js';
import { DriftError, UsageError } from '@mcpfold/core';

function capture(): { writer: Writer; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { writer: { out: (t) => out.push(t), err: (t) => err.push(t) }, out, err };
}

function assertValidEnvelope(env: JsonEnvelope): void {
  expect(env.envelopeVersion).toBe(ENVELOPE_VERSION);
  expect(typeof env.ok).toBe('boolean');
  expect(typeof env.command).toBe('string');
  expect(Array.isArray(env.warnings)).toBe(true);
  expect(Array.isArray(env.errors)).toBe(true);
  expect('data' in env).toBe(true);
  // Exactly the documented keys — no more, no less.
  expect(Object.keys(env).sort()).toEqual([
    'command',
    'data',
    'envelopeVersion',
    'errors',
    'ok',
    'warnings',
  ]);
}

describe('exit-code contract (S0.10)', () => {
  it('maps DRIFT → 1 and every other error → 2', () => {
    expect(exitCodeForError(new DriftError('drift'))).toBe(EXIT.DIFF);
    expect(exitCodeForError(new UsageError('bad flag'))).toBe(EXIT.ERROR);
    expect(exitCodeForError(new Error('boom'))).toBe(EXIT.ERROR);
    expect(exitCodeForError('weird')).toBe(EXIT.ERROR);
  });

  it('has the documented numeric values', () => {
    expect(EXIT).toEqual({ SUCCESS: 0, DIFF: 1, ERROR: 2 });
  });
});

describe('envelope shape (S0.10)', () => {
  it('success envelope conforms and snapshots stably', () => {
    const env = successEnvelope('demo', { hello: 'world' }, ['w1']);
    assertValidEnvelope(env);
    expect(env).toMatchInlineSnapshot(`
      {
        "command": "demo",
        "data": {
          "hello": "world",
        },
        "envelopeVersion": 1,
        "errors": [],
        "ok": true,
        "warnings": [
          "w1",
        ],
      }
    `);
  });

  it('error envelope carries coded errors and null data', () => {
    const env = errorEnvelope('demo', [
      toEnvelopeError(new DriftError('drift', { hint: 'run sync' })),
    ]);
    assertValidEnvelope(env);
    expect(env.ok).toBe(false);
    expect(env.data).toBeNull();
    expect(env.errors[0]).toEqual({ code: 'DRIFT', message: 'drift', hint: 'run sync' });
  });
});

describe('per-command conformance (S0.10)', () => {
  // Every command handler that exists today, in both output modes.
  const commands: { name: string; run: () => CommandOutput<unknown>; expectedExit: number }[] = [
    { name: 'diagnose', run: () => diagnose({}), expectedExit: EXIT.SUCCESS },
    { name: 'sync (clean)', run: () => runSyncCheck({ rendered: [] }), expectedExit: EXIT.SUCCESS },
    {
      name: 'sync (drift)',
      run: () =>
        runSyncCheck({
          rendered: [{ path: '/x/mcp.json', contents: '{\n  "a": 1\n}\n' }],
          readFile: () => '{\n  "a": 2\n}\n',
        }),
      expectedExit: EXIT.DIFF,
    },
  ];

  for (const cmd of commands) {
    it(`${cmd.name}: emits a valid JSON envelope and the right exit code`, async () => {
      const { writer, out, err } = capture();
      const code = await runCommand(cmd.name, true, cmd.run, writer);
      expect(code).toBe(cmd.expectedExit);
      expect(err).toHaveLength(0); // JSON mode never writes to stderr on success
      expect(out).toHaveLength(1);
      const env = JSON.parse(out[0]!) as JsonEnvelope;
      assertValidEnvelope(env);
      expect(env.ok).toBe(true);
    });

    it(`${cmd.name}: human mode writes to stdout and no envelope`, async () => {
      const { writer, out } = capture();
      await runCommand(cmd.name, false, cmd.run, writer);
      expect(out.join('')).not.toContain('envelopeVersion');
      expect(out.join('').endsWith('\n')).toBe(true);
    });
  }

  it('a throwing handler yields an error envelope + mapped exit code', async () => {
    const { writer, out } = capture();
    const code = await runCommand(
      'boom',
      true,
      () => {
        throw new UsageError('bad', { hint: 'try --help' });
      },
      writer,
    );
    expect(code).toBe(EXIT.ERROR);
    const env = JSON.parse(out[0]!) as JsonEnvelope;
    expect(env.ok).toBe(false);
    expect(env.errors[0]).toMatchObject({ code: 'USAGE', message: 'bad', hint: 'try --help' });
  });
});
