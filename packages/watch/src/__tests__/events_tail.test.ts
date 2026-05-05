import { appendFile, mkdtemp, rm, truncate, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { start_events_tail } from '../events_tail.js';
import type { EventsTailHandle } from '../events_tail.js';
import type { WeftWatchMessage } from '../messages.js';

function next_message(
  messages: WeftWatchMessage[],
  predicate: (msg: WeftWatchMessage) => boolean = () => true,
  timeout_ms = 3000,
): Promise<WeftWatchMessage> {
  return new Promise<WeftWatchMessage>((resolve, reject) => {
    const start = Date.now();
    const tick = (): void => {
      const idx = messages.findIndex(predicate);
      if (idx !== -1) {
        const [msg] = messages.splice(idx, 1);
        if (msg !== undefined) {
          resolve(msg);
          return;
        }
      }
      if (Date.now() - start > timeout_ms) {
        reject(new Error('timeout waiting for events_tail message'));
        return;
      }
      setTimeout(tick, 25);
    };
    tick();
  });
}

async function drain(messages: WeftWatchMessage[], wait_ms = 400): Promise<void> {
  await new Promise<void>((r) => setTimeout(r, wait_ms));
  messages.length = 0;
}

const span_start = (span_id: string, id: string): string =>
  JSON.stringify({ kind: 'span_start', span_id, name: 'step', id });

const span_end = (span_id: string): string =>
  JSON.stringify({ kind: 'span_end', span_id });

describe('start_events_tail', () => {
  let dir: string;
  let path: string;
  let handle: EventsTailHandle | null = null;
  let messages: WeftWatchMessage[];

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'weft-events-tail-'));
    path = join(dir, 'trajectory.jsonl');
    messages = [];
  });

  afterEach(async () => {
    if (handle !== null) {
      await handle.close();
      handle = null;
    }
    await rm(dir, { recursive: true, force: true });
  });

  it('forwards each newline-terminated JSONL line as an `event` envelope', async () => {
    await writeFile(path, '');
    handle = start_events_tail(path, {
      on_message: (msg) => {
        messages.push(msg);
      },
    });
    await appendFile(path, `${span_start('s1', 'fetch')}\n`);
    await appendFile(path, `${span_end('s1')}\n`);
    await appendFile(path, `${span_start('s2', 'parse')}\n`);

    const m1 = await next_message(messages, (m) => m.kind === 'event');
    const m2 = await next_message(messages, (m) => m.kind === 'event');
    const m3 = await next_message(messages, (m) => m.kind === 'event');
    expect(m1.kind).toBe('event');
    expect(m2.kind).toBe('event');
    expect(m3.kind).toBe('event');
    if (m1.kind === 'event' && m3.kind === 'event') {
      expect(m1.event['kind']).toBe('span_start');
      expect(m3.event['kind']).toBe('span_start');
    }
  });

  it('buffers a partial line until the trailing newline arrives', async () => {
    await writeFile(path, '');
    handle = start_events_tail(path, {
      on_message: (msg) => {
        messages.push(msg);
      },
    });
    const line = span_start('s1', 'fetch');
    await appendFile(path, line.slice(0, 20));
    // Give the watcher a chance to fire on the partial write.
    await new Promise<void>((r) => setTimeout(r, 400));
    expect(messages.find((m) => m.kind === 'event')).toBeUndefined();

    await appendFile(path, `${line.slice(20)}\n`);
    const msg = await next_message(messages, (m) => m.kind === 'event');
    expect(msg.kind).toBe('event');
  });

  it('resumes from offset 0 after the file is truncated', async () => {
    await writeFile(path, `${span_start('s1', 'fetch')}\n`);
    handle = start_events_tail(path, {
      on_message: (msg) => {
        messages.push(msg);
      },
    });
    await next_message(messages, (m) => m.kind === 'event');

    await truncate(path, 0);
    await new Promise<void>((r) => setTimeout(r, 300));
    await appendFile(path, `${span_start('s2', 'parse')}\n`);
    const after = await next_message(messages, (m) => m.kind === 'event');
    expect(after.kind).toBe('event');
    if (after.kind === 'event') {
      expect(after.event['span_id']).toBe('s2');
    }
  });

  it('emits `events_invalid` for a malformed JSON line and keeps tailing', async () => {
    await writeFile(path, '');
    handle = start_events_tail(path, {
      on_message: (msg) => {
        messages.push(msg);
      },
    });
    await appendFile(path, '{ not json\n');
    await appendFile(path, `${span_start('s1', 'fetch')}\n`);

    const bad = await next_message(messages, (m) => m.kind === 'events_invalid');
    expect(bad.kind).toBe('events_invalid');
    if (bad.kind === 'events_invalid') {
      expect(bad.path).toBe(path);
      expect(bad.line_number).toBe(1);
      expect(bad.message).toMatch(/JSON/);
    }

    const good = await next_message(messages, (m) => m.kind === 'event');
    expect(good.kind).toBe('event');
  });

  it('emits `events_invalid` for a JSON line that fails the trajectory schema', async () => {
    await writeFile(path, '');
    handle = start_events_tail(path, {
      on_message: (msg) => {
        messages.push(msg);
      },
    });
    // `kind` must be a string; here it's a number, so even the permissive
    // `custom` schema rejects it.
    await appendFile(path, `${JSON.stringify({ kind: 42 })}\n`);
    await appendFile(path, `${span_start('s1', 'fetch')}\n`);

    const bad = await next_message(messages, (m) => m.kind === 'events_invalid');
    expect(bad.kind).toBe('events_invalid');
    if (bad.kind === 'events_invalid') {
      expect(bad.message).toContain('kind');
    }

    const good = await next_message(messages, (m) => m.kind === 'event');
    expect(good.kind).toBe('event');
  });

  it('waits for an initially-missing file and attaches when it appears', async () => {
    handle = start_events_tail(path, {
      on_message: (msg) => {
        messages.push(msg);
      },
    });
    await new Promise<void>((r) => setTimeout(r, 250));
    expect(messages.length).toBe(0);

    await writeFile(path, `${span_start('s1', 'fetch')}\n`);
    const msg = await next_message(messages, (m) => m.kind === 'event');
    expect(msg.kind).toBe('event');
  });

  it('emits `unreachable` on unlink and resumes after the file is recreated', async () => {
    await writeFile(path, `${span_start('s1', 'fetch')}\n`);
    handle = start_events_tail(path, {
      on_message: (msg) => {
        messages.push(msg);
      },
    });
    await next_message(messages, (m) => m.kind === 'event');

    await unlink(path);
    const gone = await next_message(messages, (m) => m.kind === 'unreachable');
    expect(gone.kind).toBe('unreachable');
    if (gone.kind === 'unreachable') {
      expect(gone.reason).toBe('deleted');
      expect(gone.path).toBe(path);
    }

    await drain(messages, 100);
    await writeFile(path, `${span_start('s2', 'parse')}\n`);
    const back = await next_message(messages, (m) => m.kind === 'event');
    expect(back.kind).toBe('event');
    if (back.kind === 'event') {
      expect(back.event['span_id']).toBe('s2');
    }
  });
});
