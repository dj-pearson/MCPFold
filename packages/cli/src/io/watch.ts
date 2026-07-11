import { watch as fsWatch } from 'node:fs';
import { basename, dirname } from 'node:path';

/**
 * Debounced file watching for `sync --watch` (S10.2). The fs-event source is injectable so the
 * watcher can be driven deterministically in tests without touching the real filesystem or clock.
 */

/** A source of filesystem change events. `watch` returns a stop function. */
export interface FsWatcher {
  watch(path: string, onEvent: () => void): () => void;
}

/**
 * Default watcher: observe the config's *directory* and filter by filename, so atomic saves
 * (write-temp + rename, which many editors do) still fire — watching the file inode directly
 * misses those. Works on win32/darwin/linux.
 */
export const nodeFsWatcher: FsWatcher = {
  watch(path, onEvent) {
    const dir = dirname(path);
    const base = basename(path);
    const w = fsWatch(dir, { persistent: true }, (_event, filename) => {
      if (!filename || basename(filename.toString()) === base) onEvent();
    });
    return () => w.close();
  },
};

export interface WatchHandle {
  stop(): void;
}

/**
 * Watch `path` and call `onChange` after `debounceMs` of quiet, coalescing rapid edits into a
 * single fold. Never overlaps folds: a change during a running fold queues exactly one re-run.
 * `onChange` errors are the caller's to handle — this primitive never throws or dies.
 */
export function watchWithDebounce(opts: {
  path: string;
  onChange: () => void | Promise<void>;
  debounceMs?: number;
  watcher?: FsWatcher;
}): WatchHandle {
  const debounceMs = opts.debounceMs ?? 150;
  const watcher = opts.watcher ?? nodeFsWatcher;

  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let pending = false;
  let stopped = false;

  const fire = async () => {
    if (running) {
      pending = true;
      return;
    }
    running = true;
    try {
      await opts.onChange();
    } catch {
      // Never-throws contract (S22.17): `fire` is invoked as `void fire()`, so a rejected
      // onChange would become an unhandled rejection and terminate the process on modern Node.
      // onChange errors are the caller's to handle (see doc above); we only guarantee the watch
      // survives, so swallow here and keep watching.
    } finally {
      running = false;
      if (pending && !stopped) {
        pending = false;
        schedule();
      }
    }
  };

  const schedule = () => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void fire();
    }, debounceMs);
  };

  const stopWatcher = watcher.watch(opts.path, schedule);

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      if (timer) clearTimeout(timer);
      stopWatcher();
    },
  };
}
