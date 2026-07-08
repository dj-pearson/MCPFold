import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cursorAdapter, type OsContext } from '@mcpfold/adapters';
import { runImport, runSync, runDiff, EXIT } from 'mcpfold';

/**
 * Cross-platform lifecycle e2e (S8.2): import → sync → diff(clean) → mutate → diff(drift),
 * in an isolated tmp HOME, using the REAL platform's path resolution (no injected platform),
 * so ubuntu/macOS/windows each exercise their own client paths on the CI matrix.
 */

let cwd: string;
let home: string;
let ctx: OsContext;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'mcpfold-e2e-cwd-'));
  home = mkdtempSync(join(tmpdir(), 'mcpfold-e2e-home-'));
  // Real platform, but every home-relative + XDG/APPDATA path lands under the tmp HOME.
  ctx = {
    platform: process.platform,
    home,
    env: { APPDATA: join(home, 'AppData', 'Roaming'), XDG_CONFIG_HOME: join(home, '.config') },
  };
});
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

function plantCursor(contents: string): string {
  const path = cursorAdapter.resolvePath('user', undefined, ctx);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, contents);
  return path;
}

describe('full CLI lifecycle (S8.2)', () => {
  it('import → sync → diff(clean) → mutate → diff(drift), with backups and no secret values on disk', async () => {
    // 1. A pre-existing Cursor config with a stdio server and a REMOTE server whose token is
    //    hardcoded (import should rewrite it to an ${env:...} reference, never copy it).
    const SECRET = 'ghp_hardcoded_should_never_persist_123';
    plantCursor(
      JSON.stringify({
        mcpServers: {
          // A stdio server carrying a hardcoded secret in env — import must rewrite it to a
          // ${env:...} reference, never copy the value.
          playwright: {
            command: 'npx',
            args: ['-y', '@playwright/mcp@latest'],
            env: { API_TOKEN: SECRET },
          },
          github: { url: 'https://api.githubcopilot.com/mcp/' },
        },
      }),
    );

    // 2. import → merged canonical config in cwd.
    const imported = await runImport({ cwd, osContext: ctx });
    expect(imported.data.sources).toContain('cursor');
    const canonical = readFileSync(join(cwd, 'mcp.config.jsonc'), 'utf8');
    expect(canonical).not.toContain(SECRET); // rewritten to a placeholder
    expect(canonical).toContain('${env:');

    // 3. sync → writes the Cursor client file.
    const cursorPath = cursorAdapter.resolvePath('user', undefined, ctx);
    // The planted file is overwritten, so a timestamped backup must be created first.
    const synced = await runSync({ cwd, osContext: ctx });
    expect(synced.data.wrote).toBe(true);
    const backups = readdirSync(join(cursorPath, '..')).filter((f) => f.includes('.mcpfold.bak.'));
    expect(backups.length).toBeGreaterThanOrEqual(1);

    // 4. diff → clean (exit 0).
    const cleanDiff = await runDiff({ cwd, osContext: ctx });
    expect(cleanDiff.exit).toBe(EXIT.SUCCESS);
    expect(cleanDiff.data.drift).toBe(false);

    // 5. No secret VALUE in what mcpfold WROTE (the shim strategy keeps the ref off disk).
    //    Backups (.mcpfold.bak.*) are copies of the USER's original file and may contain
    //    whatever they had — that is their data, not mcpfold output — so they're excluded.
    expect(readFileSync(cursorPath, 'utf8')).not.toContain(SECRET);
    for (const file of readdirSync(join(cursorPath, '..'))) {
      if (file.includes('.mcpfold.bak.')) continue;
      expect(readFileSync(join(cursorPath, '..', file), 'utf8')).not.toContain(SECRET);
    }

    // 6. Mutate the on-disk client file → diff reports drift (exit nonzero).
    mkdirSync(join(cursorPath, '..'), { recursive: true });
    writeFileSync(cursorPath, JSON.stringify({ mcpServers: { rogue: { command: 'evil' } } }));
    const driftDiff = await runDiff({ cwd, osContext: ctx });
    expect(driftDiff.exit).toBe(EXIT.DIFF);
    expect(driftDiff.data.drift).toBe(true);
  });

  it('a second sync is idempotent (unchanged, no new backup)', async () => {
    plantCursor(JSON.stringify({ mcpServers: { pw: { command: 'npx', args: ['-y', 'x'] } } }));
    await runImport({ cwd, osContext: ctx });
    await runSync({ cwd, osContext: ctx });
    const cursorDir = join(cursorAdapter.resolvePath('user', undefined, ctx), '..');
    const backupsBefore = readdirSync(cursorDir).filter((f) => f.includes('.mcpfold.bak.')).length;
    const second = await runSync({ cwd, osContext: ctx });
    expect(second.data.wrote).toBe(false);
    const backupsAfter = readdirSync(cursorDir).filter((f) => f.includes('.mcpfold.bak.')).length;
    expect(backupsAfter).toBe(backupsBefore);
  });

  it('resolves the correct per-OS client path for the running platform', () => {
    const path = cursorAdapter.resolvePath('user', undefined, ctx);
    expect(path.startsWith(home)).toBe(true);
    expect(existsSync(cwd)).toBe(true);
  });
});
