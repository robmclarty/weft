/**
 * Tail a fascicle trajectory JSONL log and forward each parsed event as a
 * WeftWatchMessage envelope.
 *
 * Behavior per spec §5.1 / §8 F1-F6:
 *   - Initially-missing file: poll `stat` every POLL_INTERVAL_MS until it
 *     appears (no banner — absence is normal at run start).
 *   - On size growth: read the new bytes, append to a partial-line buffer,
 *     split on `\n`, retain trailing fragment. JSON.parse + safeParse each
 *     complete line; broadcast `event` on success, `events_invalid` on either
 *     failure mode.
 *   - On size shrinkage (truncate / rotate): reset offset and partial-line
 *     buffer, then resume from start.
 *   - On unlink: emit `unreachable { reason: 'deleted' }` once, keep polling
 *     for re-creation. When the file is recreated, resume from offset 0.
 *   - Single-flight: a wake fired while a previous read is in flight sets a
 *     `pending` flag; the read loop re-enters once on completion.
 */

import { close, open, read, stat } from 'node:fs';
import { unwatchFile, watchFile } from 'node:fs';
import type { Stats } from 'node:fs';
import type { ParsedTrajectoryEvent } from './trajectory_event_schema.js';
import { trajectory_event_schema } from './trajectory_event_schema.js';
import type { WeftWatchMessage } from './messages.js';

export type EventsTailCallbacks = {
  readonly on_message: (message: WeftWatchMessage) => void;
};

export type EventsTailHandle = {
  readonly close: () => Promise<void>;
};

const POLL_INTERVAL_MS = 200;
const READ_CHUNK_BYTES = 64 * 1024;

type TailState = {
  offset: number;
  partial: string;
  line_number: number;
  exists: boolean;
  reading: boolean;
  pending: boolean;
  closed: boolean;
};

function stat_path(file_path: string): Promise<Stats | null> {
  return new Promise((resolve) => {
    stat(file_path, (err, stats) => {
      if (err) {
        resolve(null);
        return;
      }
      resolve(stats);
    });
  });
}

function open_for_read(file_path: string): Promise<number | null> {
  return new Promise((resolve) => {
    open(file_path, 'r', (err, fd) => {
      if (err) {
        resolve(null);
        return;
      }
      resolve(fd);
    });
  });
}

function read_range(fd: number, offset: number, length: number): Promise<{ bytes_read: number; chunk: Buffer }> {
  return new Promise((resolve, reject) => {
    const buf = Buffer.alloc(length);
    read(fd, buf, 0, length, offset, (err, bytes_read, buffer) => {
      if (err) {
        reject(err);
        return;
      }
      resolve({ bytes_read, chunk: buffer.subarray(0, bytes_read) });
    });
  });
}

function close_fd(fd: number): Promise<void> {
  return new Promise((resolve) => {
    close(fd, () => {
      resolve();
    });
  });
}

type ZodIssue = {
  readonly path: ReadonlyArray<string | number>;
  readonly message: string;
  readonly code?: string;
  readonly unionErrors?: ReadonlyArray<{ readonly issues: ReadonlyArray<ZodIssue> }>;
};

function flatten_issues(issues: ReadonlyArray<ZodIssue>): ZodIssue[] {
  const out: ZodIssue[] = [];
  for (const issue of issues) {
    if (issue.code === 'invalid_union' && issue.unionErrors !== undefined) {
      for (const inner of issue.unionErrors) {
        out.push(...flatten_issues(inner.issues));
      }
      continue;
    }
    out.push(issue);
  }
  return out;
}

function format_zod_error(error: { readonly issues: ReadonlyArray<ZodIssue> }): string {
  const flat = flatten_issues(error.issues);
  const head = flat[0];
  if (head === undefined) return 'unknown validation error';
  // Pick the issue with the longest path — most specific error wins. Among
  // union sub-errors, the catch-all `custom` arm tends to produce the
  // shortest, most actionable message ("expected string, received number").
  let best = head;
  for (const issue of flat) {
    if (issue.path.length > best.path.length) best = issue;
  }
  const path = best.path.length > 0 ? best.path.join('.') : '<root>';
  return `${path}: ${best.message}`;
}

function parse_line(line: string):
  | { ok: true; event: ParsedTrajectoryEvent }
  | { ok: false; message: string } {
  let json: unknown;
  try {
    json = JSON.parse(line);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `invalid JSON: ${msg}` };
  }
  const parsed = trajectory_event_schema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, message: format_zod_error(parsed.error) };
  }
  return { ok: true, event: parsed.data };
}

async function read_appended(
  file_path: string,
  state: TailState,
  callbacks: EventsTailCallbacks,
): Promise<void> {
  const stats = await stat_path(file_path);
  if (stats === null) {
    if (state.exists) {
      state.exists = false;
      state.offset = 0;
      state.partial = '';
      state.line_number = 0;
      callbacks.on_message({
        kind: 'unreachable',
        reason: 'deleted',
        path: file_path,
      });
    }
    return;
  }
  if (!state.exists) {
    state.exists = true;
    state.offset = 0;
    state.partial = '';
    state.line_number = 0;
  }
  if (stats.size < state.offset) {
    state.offset = 0;
    state.partial = '';
    state.line_number = 0;
  }
  if (stats.size === state.offset) return;

  const fd = await open_for_read(file_path);
  if (fd === null) return;

  try {
    let cursor = state.offset;
    while (cursor < stats.size) {
      const remaining = stats.size - cursor;
      const length = Math.min(READ_CHUNK_BYTES, remaining);
      const { bytes_read, chunk } = await read_range(fd, cursor, length);
      if (bytes_read === 0) break;
      cursor += bytes_read;
      state.partial += chunk.toString('utf8');
    }
    state.offset = cursor;
  } finally {
    await close_fd(fd);
  }

  // Split off complete lines; keep the trailing fragment in the buffer.
  const newline = state.partial.lastIndexOf('\n');
  if (newline === -1) return;
  const complete = state.partial.slice(0, newline);
  state.partial = state.partial.slice(newline + 1);

  for (const raw of complete.split('\n')) {
    state.line_number += 1;
    if (raw.length === 0) continue;
    const result = parse_line(raw);
    if (!result.ok) {
      callbacks.on_message({
        kind: 'events_invalid',
        path: file_path,
        line_number: state.line_number,
        message: result.message,
      });
      continue;
    }
    callbacks.on_message({ kind: 'event', event: result.event });
  }
}

export function start_events_tail(
  file_path: string,
  callbacks: EventsTailCallbacks,
): EventsTailHandle {
  const state: TailState = {
    offset: 0,
    partial: '',
    line_number: 0,
    exists: false,
    reading: false,
    pending: false,
    closed: false,
  };

  const drain = (): void => {
    if (state.closed) return;
    if (state.reading) {
      state.pending = true;
      return;
    }
    state.reading = true;
    void (async () => {
      try {
        do {
          state.pending = false;
          await read_appended(file_path, state, callbacks);
        } while (state.pending && !state.closed);
      } finally {
        state.reading = false;
      }
    })();
  };

  // `watchFile` polls the path itself (not the directory entry), so it
  // survives unlink+recreate. Pair its mtime/size diff with our own offset
  // tracking; we re-stat inside `read_appended` for authoritative sizes.
  watchFile(file_path, { interval: POLL_INTERVAL_MS, persistent: true }, () => {
    drain();
  });

  // Initial drain: handles the case where the file already exists with
  // content at startup.
  drain();

  return {
    close: async () => {
      state.closed = true;
      unwatchFile(file_path);
    },
  };
}
