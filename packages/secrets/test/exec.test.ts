import { describe, expect, it } from 'vitest';
import { defaultExec } from '../src/exec.js';

// Use the current Node binary as a cross-platform "fake CLI" we can script inline.
const NODE = process.execPath;

describe('defaultExec (S20.4)', () => {
  it('runs a command and captures stdout + exit code', async () => {
    const r = await defaultExec(NODE, ['-e', 'process.stdout.write("hi")']);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('hi');
  });

  it('terminates a hung child when the signal aborts, instead of orphaning it', async () => {
    const controller = new AbortController();
    const started = Date.now();
    // A child that would otherwise run forever; abort shortly after it starts.
    const p = defaultExec(NODE, ['-e', 'setInterval(() => {}, 1000)'], {
      signal: controller.signal,
      killGraceMs: 200,
    });
    setTimeout(() => controller.abort(), 50);
    const r = await p;
    // It settled because the child was killed — not because it ran to completion.
    expect(Date.now() - started).toBeLessThan(4000);
    // A terminated process never reports clean success.
    expect(r.code).not.toBe(0);
  }, 10_000);

  it('rejects immediately when the signal is already aborted', async () => {
    await expect(defaultExec(NODE, ['-e', ''], { signal: AbortSignal.abort() })).rejects.toThrow(
      /aborted/,
    );
  });
});
