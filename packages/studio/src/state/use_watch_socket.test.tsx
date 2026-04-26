import { afterEach, describe, expect, it } from 'vitest';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import {
  use_watch_socket,
  type SocketLike,
  type UseWatchSocketResult,
} from './use_watch_socket.js';
import type { WatchEnvelope } from './watch_envelope.js';

type Listener = (event: Event) => void;

type FakeSocket = SocketLike & {
  fire: (type: 'open' | 'close' | 'error' | 'message', data?: unknown) => void;
};

function make_fake_socket(): FakeSocket {
  const listeners = new Map<string, Set<Listener>>();
  const get_set = (k: string): Set<Listener> => {
    let s = listeners.get(k);
    if (s === undefined) {
      s = new Set();
      listeners.set(k, s);
    }
    return s;
  };
  return {
    readyState: 0,
    addEventListener: (type, handler) => {
      get_set(type).add(handler);
    },
    removeEventListener: (type, handler) => {
      get_set(type).delete(handler);
    },
    close: () => {
      // ignored: tests fire 'close' directly
    },
    fire: (type, data) => {
      const set = listeners.get(type);
      if (set === undefined) return;
      const event: Event =
        type === 'message'
          ? new MessageEvent('message', { data })
          : new Event(type);
      for (const h of set) h(event);
    },
  };
}

let host: HTMLDivElement | null = null;
let mounted_root: Root | null = null;

function mount_with_factory(
  url: string | null,
  factory: ((url: string) => SocketLike) | undefined,
): { read: () => UseWatchSocketResult } {
  let captured: UseWatchSocketResult | null = null;
  const Probe = (): null => {
    captured = use_watch_socket(
      factory === undefined ? { url } : { url, socket_factory: factory },
    );
    return null;
  };
  host = document.createElement('div');
  document.body.append(host);
  mounted_root = createRoot(host);
  act(() => {
    mounted_root!.render(<Probe />);
  });
  return {
    read: () => {
      if (captured === null) throw new Error('hook never ran');
      return captured;
    },
  };
}

afterEach(() => {
  if (mounted_root !== null) {
    act(() => {
      mounted_root!.unmount();
    });
    mounted_root = null;
  }
  if (host !== null) {
    host.remove();
    host = null;
  }
});

describe('use_watch_socket', () => {
  it('returns idle when url is null', () => {
    const h = mount_with_factory(null, undefined);
    expect(h.read().status).toBe('idle');
  });

  it('transitions connecting → connected on open', () => {
    const sock = make_fake_socket();
    const factory = (): SocketLike => sock;
    const h = mount_with_factory('ws://127.0.0.1:1234', factory);
    expect(h.read().status).toBe('connecting');
    act(() => {
      sock.fire('open');
    });
    expect(h.read().status).toBe('connected');
  });

  it('records tree envelopes', () => {
    const sock = make_fake_socket();
    const factory = (): SocketLike => sock;
    const h = mount_with_factory('ws://127.0.0.1:1234', factory);
    act(() => {
      sock.fire('open');
    });
    const envelope: WatchEnvelope = {
      kind: 'tree',
      tree: { version: 1, root: { kind: 'step', id: 'a' } },
    };
    act(() => {
      sock.fire('message', JSON.stringify(envelope));
    });
    expect(h.read().last_envelope?.kind).toBe('tree');
  });

  it('ignores non-string and malformed messages', () => {
    const sock = make_fake_socket();
    const factory = (): SocketLike => sock;
    const h = mount_with_factory('ws://127.0.0.1:1234', factory);
    act(() => {
      sock.fire('open');
    });
    act(() => {
      sock.fire('message', { not: 'a string' });
      sock.fire('message', 'not json');
      sock.fire('message', JSON.stringify({ kind: 'never' }));
    });
    expect(h.read().last_envelope).toBeNull();
  });

  it('schedules reconnect on close', () => {
    const factories: FakeSocket[] = [];
    const factory = (): SocketLike => {
      const s = make_fake_socket();
      factories.push(s);
      return s;
    };
    const h = mount_with_factory('ws://127.0.0.1:1234', factory);
    expect(factories).toHaveLength(1);
    act(() => {
      factories[0]!.fire('open');
    });
    act(() => {
      factories[0]!.fire('close');
    });
    const state = h.read();
    expect(state.status).toBe('reconnecting');
    expect(state.attempt).toBe(1);
  });

  it('retry resets the attempt counter', () => {
    const factories: FakeSocket[] = [];
    const factory = (): SocketLike => {
      const s = make_fake_socket();
      factories.push(s);
      return s;
    };
    const h = mount_with_factory('ws://127.0.0.1:1234', factory);
    act(() => {
      factories[0]!.fire('close');
    });
    let state = h.read();
    expect(state.attempt).toBe(1);
    act(() => {
      state.retry();
    });
    state = h.read();
    expect(state.status).toBe('connecting');
    expect(state.attempt).toBe(0);
  });
});
