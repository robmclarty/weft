import { mkdtemp, rm, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { start_watcher } from '../watcher.js';
import type { WatcherHandle } from '../watcher.js';
import type { WeftWatchMessage } from '../messages.js';

function next_message(messages: WeftWatchMessage[], timeout_ms = 1500): Promise<WeftWatchMessage> {
  return new Promise<WeftWatchMessage>((resolve, reject) => {
    const start = Date.now();
    const interval = setInterval(() => {
      if (messages.length > 0) {
        clearInterval(interval);
        const msg = messages.shift();
        if (msg !== undefined) resolve(msg);
        return;
      }
      if (Date.now() - start > timeout_ms) {
        clearInterval(interval);
        reject(new Error('timeout waiting for watcher message'));
      }
    }, 20);
  });
}

describe('start_watcher', () => {
  let dir: string;
  let path: string;
  let handle: WatcherHandle | null = null;
  let messages: WeftWatchMessage[];

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'weft-watch-watcher-'));
    path = join(dir, 'flow.json');
    messages = [];
  });

  afterEach(async () => {
    if (handle !== null) {
      await handle.close();
      handle = null;
    }
    await rm(dir, { recursive: true, force: true });
  });

  it('emits a `tree` message when the watched file changes to valid content', async () => {
    await writeFile(
      path,
      JSON.stringify({ version: 1, root: { kind: 'step', id: 's1' } }),
    );
    handle = start_watcher(path, {
      on_message: (msg) => {
        messages.push(msg);
      },
    });
    // Give chokidar a moment to register the watch.
    await new Promise<void>((r) => setTimeout(r, 100));
    await writeFile(
      path,
      JSON.stringify({ version: 1, root: { kind: 'step', id: 's2' } }),
    );
    const msg = await next_message(messages);
    expect(msg.kind).toBe('tree');
    if (msg.kind === 'tree') {
      expect(msg.tree.root.id).toBe('s2');
    }
  });

  it('emits an `invalid` message when the watched file changes to bad content', async () => {
    await writeFile(
      path,
      JSON.stringify({ version: 1, root: { kind: 'step', id: 's1' } }),
    );
    handle = start_watcher(path, {
      on_message: (msg) => {
        messages.push(msg);
      },
    });
    await new Promise<void>((r) => setTimeout(r, 100));
    await writeFile(path, '{ broken json');
    const msg = await next_message(messages);
    expect(msg.kind).toBe('invalid');
    if (msg.kind === 'invalid') {
      expect(msg.path).toBe(path);
      expect(msg.zod_path.length).toBeGreaterThan(0);
    }
  });

  it('emits an `unreachable` message with reason="deleted" when the watched file is removed', async () => {
    await writeFile(
      path,
      JSON.stringify({ version: 1, root: { kind: 'step', id: 's1' } }),
    );
    handle = start_watcher(path, {
      on_message: (msg) => {
        messages.push(msg);
      },
    });
    await new Promise<void>((r) => setTimeout(r, 100));
    await unlink(path);
    const msg = await next_message(messages);
    expect(msg.kind).toBe('unreachable');
    if (msg.kind === 'unreachable') {
      expect(msg.reason).toBe('deleted');
      expect(msg.path).toBe(path);
    }
  });
});
