/**
 * chokidar wrapper that emits WeftWatchMessage envelopes on file changes.
 *
 * Behavior per spec §5.5 / §8 F1, F7:
 *   - on `change`: re-read, re-validate, emit `tree` or `invalid`.
 *   - on `unlink`: emit `unreachable` with reason `'deleted'`.
 *   - read errors emit `unreachable` with reason `'read_error'`.
 *
 * Validation failures during a hot reload do not crash the watcher; the
 * watcher stays active and waits for the next change (AC 13).
 */

import { watch } from 'chokidar';
import type { FSWatcher } from 'chokidar';
import { read_and_validate } from './validate.js';
import type { WeftWatchMessage } from './messages.js';

export type WatcherCallbacks = {
  readonly on_message: (message: WeftWatchMessage) => void;
};

export type WatcherHandle = {
  readonly close: () => Promise<void>;
};

async function dispatch_current_state(
  file_path: string,
  callbacks: WatcherCallbacks,
): Promise<void> {
  const result = await read_and_validate(file_path);
  if (result.kind === 'tree') {
    callbacks.on_message({ kind: 'tree', tree: result.tree });
    return;
  }
  if (result.kind === 'invalid') {
    callbacks.on_message({
      kind: 'invalid',
      path: file_path,
      zod_path: result.zod_path,
      message: result.message,
    });
    return;
  }
  callbacks.on_message({
    kind: 'unreachable',
    reason: 'read_error',
    path: file_path,
  });
}

export function start_watcher(
  file_path: string,
  callbacks: WatcherCallbacks,
): WatcherHandle {
  const watcher: FSWatcher = watch(file_path, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 20 },
  });

  watcher.on('change', () => {
    void dispatch_current_state(file_path, callbacks);
  });

  watcher.on('add', () => {
    void dispatch_current_state(file_path, callbacks);
  });

  watcher.on('unlink', () => {
    callbacks.on_message({
      kind: 'unreachable',
      reason: 'deleted',
      path: file_path,
    });
  });

  return {
    close: () => watcher.close(),
  };
}
