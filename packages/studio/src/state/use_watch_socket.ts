/**
 * React hook: WebSocket client for the watch CLI.
 *
 * Per spec §5.5 / research F10. The client reconnects on close with
 * exponential backoff + jitter (see `backoff.ts`). After
 * `BACKOFF_MAX_ATTEMPTS` failed attempts, the hook surfaces a
 * `give_up` status so the caller can render a manual reconnect button.
 *
 * Side effects (WebSocket lifecycle, setTimeout) are encapsulated here.
 * `WebSocket` is injected as a factory so the hook can be unit-tested
 * with a fake. In production, the factory defaults to `new WebSocket(url)`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  BACKOFF_MAX_ATTEMPTS,
  next_backoff_delay,
} from './backoff.js';
import {
  is_watch_envelope,
  type WatchEnvelope,
} from './watch_envelope.js';

export type WatchStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'gave_up'
  | 'closed';

export type WatchSocketState = {
  readonly status: WatchStatus;
  readonly attempt: number;
  readonly last_envelope: WatchEnvelope | null;
};

export type SocketLike = {
  readonly readyState: number;
  addEventListener: (
    type: 'open' | 'close' | 'error' | 'message',
    listener: (event: Event) => void,
  ) => void;
  removeEventListener: (
    type: 'open' | 'close' | 'error' | 'message',
    listener: (event: Event) => void,
  ) => void;
  close: (code?: number, reason?: string) => void;
};

export type UseWatchSocketOptions = {
  readonly url: string | null;
  readonly socket_factory?: ((url: string) => SocketLike) | undefined;
};

export type UseWatchSocketResult = WatchSocketState & {
  readonly retry: () => void;
};

function default_factory(url: string): SocketLike {
  return new WebSocket(url);
}

type SocketEntry = {
  readonly socket: SocketLike;
  readonly listeners: ReadonlyArray<{
    readonly type: 'open' | 'close' | 'error' | 'message';
    readonly handler: (event: Event) => void;
  }>;
};

function detach(entry: SocketEntry): void {
  for (const listener of entry.listeners) {
    entry.socket.removeEventListener(listener.type, listener.handler);
  }
  try {
    entry.socket.close();
  } catch {
    // ignore
  }
}

export function use_watch_socket(
  options: UseWatchSocketOptions,
): UseWatchSocketResult {
  const { url, socket_factory } = options;
  // Memoize the factory: a fresh lambda on every render would re-fire
  // the connect/effect chain and re-mount the socket on every state
  // update, producing an infinite render loop.
  const factory = useMemo(
    () => socket_factory ?? default_factory,
    [socket_factory],
  );
  const [state, set_state] = useState<WatchSocketState>(() => ({
    status: 'idle',
    attempt: 0,
    last_envelope: null,
  }));

  const cancelled_ref = useRef(false);
  const timer_ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const entry_ref = useRef<SocketEntry | null>(null);

  const connect = useCallback(
    (target_url: string, attempt: number) => {
      set_state((prev) => ({
        status: attempt === 0 ? 'connecting' : 'reconnecting',
        attempt,
        last_envelope: prev.last_envelope,
      }));
      const socket = factory(target_url);
      const handle_open = (): void => {
        if (cancelled_ref.current) return;
        set_state((prev) => ({
          status: 'connected',
          attempt: 0,
          last_envelope: prev.last_envelope,
        }));
      };
      const handle_message = (event: Event): void => {
        if (cancelled_ref.current) return;
        // `data` lives on MessageEvent.prototype, so hasOwnProperty
        // returns false on the event instance. Use `in` to traverse
        // the prototype chain.
        const raw_data: unknown = 'data' in event ? Reflect.get(event, 'data') : undefined;
        if (typeof raw_data !== 'string') return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw_data);
        } catch {
          return;
        }
        if (!is_watch_envelope(parsed)) return;
        set_state((prev) => ({ ...prev, last_envelope: parsed }));
      };
      const handle_error = (): void => {
        // The browser will fire close immediately after; let that path
        // drive the retry logic.
      };
      const handle_close = (): void => {
        if (cancelled_ref.current) return;
        entry_ref.current = null;
        const next_attempt = attempt + 1;
        if (next_attempt >= BACKOFF_MAX_ATTEMPTS) {
          set_state((prev) => ({
            status: 'gave_up',
            attempt: next_attempt,
            last_envelope: prev.last_envelope,
          }));
          return;
        }
        set_state((prev) => ({
          status: 'reconnecting',
          attempt: next_attempt,
          last_envelope: prev.last_envelope,
        }));
        const delay = next_backoff_delay(next_attempt);
        timer_ref.current = setTimeout(() => {
          if (cancelled_ref.current) return;
          connect(target_url, next_attempt);
        }, delay);
      };
      socket.addEventListener('open', handle_open);
      socket.addEventListener('message', handle_message);
      socket.addEventListener('error', handle_error);
      socket.addEventListener('close', handle_close);
      entry_ref.current = {
        socket,
        listeners: [
          { type: 'open', handler: handle_open },
          { type: 'message', handler: handle_message },
          { type: 'error', handler: handle_error },
          { type: 'close', handler: handle_close },
        ],
      };
    },
    [factory],
  );

  useEffect(() => {
    cancelled_ref.current = false;
    if (url === null) {
      set_state({ status: 'idle', attempt: 0, last_envelope: null });
      return undefined;
    }
    connect(url, 0);
    return () => {
      cancelled_ref.current = true;
      if (timer_ref.current !== null) {
        clearTimeout(timer_ref.current);
        timer_ref.current = null;
      }
      const entry = entry_ref.current;
      if (entry !== null) {
        detach(entry);
        entry_ref.current = null;
      }
    };
  }, [url, connect]);

  const retry = useCallback(() => {
    if (url === null) return;
    if (timer_ref.current !== null) {
      clearTimeout(timer_ref.current);
      timer_ref.current = null;
    }
    const entry = entry_ref.current;
    if (entry !== null) {
      detach(entry);
      entry_ref.current = null;
    }
    set_state({ status: 'connecting', attempt: 0, last_envelope: null });
    connect(url, 0);
  }, [url, connect]);

  return { ...state, retry };
}
