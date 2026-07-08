import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Terminal-demo guard (S11.4): the demo drives the REAL built CLI against committed fixtures, so
 * this proves the golden path still runs to completion, the recording is deterministic (regenerating
 * twice is byte-identical), and it leads with the context-window number. Skipped when the CLI has
 * not been built (the recorder spawns packages/cli/dist/bin.js).
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'packages/cli/dist/bin.js');
const RECORDER = join(ROOT, 'scripts/record-demo.mjs');

describe('terminal demo (S11.4)', () => {
  it.skipIf(!existsSync(CLI))(
    'runs the golden path deterministically and produces a non-empty cast',
    () => {
      const dir = mkdtempSync(join(tmpdir(), 'mcpfold-demo-test-'));
      try {
        const a = join(dir, 'a.cast');
        const b = join(dir, 'b.cast');
        execFileSync(process.execPath, [RECORDER, '--out', a], { stdio: 'pipe' });
        execFileSync(process.execPath, [RECORDER, '--out', b], { stdio: 'pipe' });
        const castA = readFileSync(a, 'utf8');
        const castB = readFileSync(b, 'utf8');

        expect(castA.length).toBeGreaterThan(500); // a real recording
        expect(castA).toBe(castB); // deterministic regeneration
        expect(castA).toContain('7476'); // leads with the context-window number
        expect(castA).toContain('mcpfold import');
        expect(castA).toContain('mcpfold sync');
        expect(castA).toContain('No drift'); // ends on a clean diff
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});
