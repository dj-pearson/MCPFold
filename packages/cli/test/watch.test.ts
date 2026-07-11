import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OsContext } from '@mcpfold/adapters';
import { runSyncWatch } from '../src/commands/sync.js';
import { type FsWatcher, watchWithDebounce } from '../src/io/watch.js';

const CONFIG = `{
  "version": 1,
  "servers": {
    "playwright": { "transport": "stdio", "command": "npx", "args": ["-y", "@playwright/mcp@latest"], "pin": "1.4.2", "tags": ["code"] }
  },
  "profiles": { "cursor-user": { "client": "cursor", "scope": "user", "include": ["code"] } }
}`;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A driveable fs-event source: the test fires change events and can see if it was stopped. */
function fakeWatcher() {
  let onEvent: (() => void) | null = null;
  let stopped = false;
  const watcher: FsWatcher = {
    watch(_path, cb) {
      onEvent = cb;
      return () => {
        stopped = true;
      };
    },
  };
  return { watcher, fire: () => onEvent?.(), isStopped: () => stopped };
}

let cwd: string;
let home: string;
let ctx: OsContext;
let configPath: string;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'mcpfold-watch-cwd-'));
  home = mkdtempSync(join(tmpdir(), 'mcpfold-watch-home-'));
  configPath = join(cwd, 'mcp.config.jsonc');
  writeFileSync(configPath, CONFIG);
  ctx = { platform: 'linux', home, env: {} };
});
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

describe('watchWithDebounce (S10.2)', () => {
  it('coalesces rapid change events into a single fold', async () => {
    const fw = fakeWatcher();
    let count = 0;
    const handle = watchWithDebounce({
      path: 'x',
      debounceMs: 20,
      watcher: fw.watcher,
      onChange: () => {
        count++;
      },
    });
    fw.fire();
    fw.fire();
    fw.fire();
    await delay(60);
    expect(count).toBe(1);
    handle.stop();
  });

  it('stop() is clean and idempotent, and releases the watcher', () => {
    const fw = fakeWatcher();
    const handle = watchWithDebounce({ path: 'x', watcher: fw.watcher, onChange: () => {} });
    handle.stop();
    handle.stop(); // idempotent — no throw
    expect(fw.isStopped()).toBe(true);
  });

  // S22.17: a rejecting onChange must not become an unhandled rejection (which would crash the
  // process) — the watch swallows it and keeps running.
  it('swallows a rejecting onChange without an unhandled rejection, and keeps watching', async () => {
    const fw = fakeWatcher();
    const rejections: unknown[] = [];
    const onUnhandled = (r: unknown): void => {
      rejections.push(r);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      let calls = 0;
      const handle = watchWithDebounce({
        path: 'x',
        debounceMs: 5,
        watcher: fw.watcher,
        onChange: () => {
          calls++;
          return Promise.reject(new Error('boom'));
        },
      });
      fw.fire();
      await delay(30);
      expect(calls).toBe(1);
      // The watch is still alive — a second change still drives onChange.
      fw.fire();
      await delay(30);
      expect(calls).toBe(2);
      await delay(10); // let any stray microtask surface as an unhandled rejection
      expect(rejections).toHaveLength(0);
      handle.stop();
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});

describe('runSyncWatch (S10.2)', () => {
  it('folds initially and re-folds on change', async () => {
    const fw = fakeWatcher();
    const writes: string[] = [];
    const handle = runSyncWatch(
      { cwd, osContext: ctx },
      { write: (l) => writes.push(l), watcher: fw.watcher, debounceMs: 20 },
    );
    await delay(60);
    expect(writes.some((l) => l.includes('initial fold'))).toBe(true);
    expect(existsSync(join(home, '.cursor', 'mcp.json'))).toBe(true);

    fw.fire();
    await delay(60);
    expect(writes.some((l) => l.includes('change'))).toBe(true);
    handle.stop();
  });

  it('reports an invalid config mid-edit without crashing the watcher', async () => {
    const fw = fakeWatcher();
    const writes: string[] = [];
    const handle = runSyncWatch(
      { cwd, osContext: ctx },
      { write: (l) => writes.push(l), watcher: fw.watcher, debounceMs: 20 },
    );
    await delay(60);

    writeFileSync(configPath, '{ not valid json');
    fw.fire();
    await delay(60);
    expect(writes.some((l) => l.includes('error'))).toBe(true);
    expect(fw.isStopped()).toBe(false); // watcher survived

    // A subsequent valid edit still folds.
    writeFileSync(configPath, CONFIG);
    fw.fire();
    await delay(60);
    handle.stop();
  });
});
