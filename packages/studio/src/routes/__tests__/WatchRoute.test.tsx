import { afterEach, describe, expect, it } from 'vitest';

import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

import { WatchRoute } from '../WatchRoute.js';
import type { SocketLike } from '../../state/use_watch_socket.js';

let mounted: { container: HTMLDivElement; root: Root } | null = null;

function mount(element: ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement('div');
  document.body.append(container);
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(element);
  });
  return { container, root };
}

afterEach(() => {
  if (mounted !== null) {
    act(() => {
      mounted!.root.unmount();
    });
    mounted.container.remove();
    mounted = null;
  }
});

type Listener = (event: Event) => void;

function make_fake_socket(): SocketLike & {
  fire: (type: 'open' | 'close' | 'error' | 'message', data?: unknown) => void;
} {
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
      // noop
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

describe('WatchRoute', () => {
  it('renders the empty hint without ?ws', () => {
    mounted = mount(
      <MemoryRouter initialEntries={['/watch']}>
        <WatchRoute />
      </MemoryRouter>,
    );
    expect(mounted.container.querySelector('[data-weft-route="watch"]')).not.toBeNull();
    expect(mounted.container.textContent).toContain('?ws=');
  });

  it('shows a connecting banner when ?ws is present', () => {
    const sock = make_fake_socket();
    const factory = (): SocketLike => sock;
    mounted = mount(
      <MemoryRouter initialEntries={['/watch?ws=12345']}>
        <WatchRoute socket_factory={factory} />
      </MemoryRouter>,
    );
    expect(mounted.container.textContent).toContain('connecting');
  });

  it('renders unreachable banner on unreachable envelope', () => {
    const sock = make_fake_socket();
    const factory = (): SocketLike => sock;
    mounted = mount(
      <MemoryRouter initialEntries={['/watch?ws=12345']}>
        <WatchRoute socket_factory={factory} />
      </MemoryRouter>,
    );
    act(() => {
      sock.fire('open');
    });
    act(() => {
      sock.fire(
        'message',
        JSON.stringify({
          kind: 'unreachable',
          reason: 'deleted',
          path: '/tmp/x',
        }),
      );
    });
    expect(mounted.container.textContent).toContain('deleted');
  });

  it('rejects non-numeric ws values', () => {
    mounted = mount(
      <MemoryRouter initialEntries={['/watch?ws=oops']}>
        <WatchRoute />
      </MemoryRouter>,
    );
    expect(mounted.container.textContent).toContain('?ws=');
  });
});
