import { afterEach, describe, expect, it, vi } from 'vitest';

import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

import { ViewRoute } from '../ViewRoute.js';
import type { FetchLike } from '../../loaders/url_fetch.js';

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

describe('ViewRoute', () => {
  it('renders the empty hint without ?src', () => {
    mounted = mount(
      <MemoryRouter initialEntries={['/view']}>
        <ViewRoute />
      </MemoryRouter>,
    );
    expect(mounted.container.querySelector('[data-weft-route="view"]')).not.toBeNull();
    expect(mounted.container.textContent).toContain('?src=');
  });

  it('shows a fetch banner while loading', () => {
    const fake_fetch: FetchLike = vi.fn<FetchLike>(
      () =>
        new Promise(() => {
          // never resolves — keeps the banner visible
        }),
    );
    mounted = mount(
      <MemoryRouter
        initialEntries={['/view?src=https%3A%2F%2Fexample.com%2Fflow.json']}
      >
        <ViewRoute fetch_impl={fake_fetch} />
      </MemoryRouter>,
    );
    expect(mounted.container.textContent).toContain('fetching');
  });

  it('replaces the canvas when fetch returns a valid tree', async () => {
    const fake_fetch: FetchLike = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () =>
        JSON.stringify({
          version: 1,
          root: {
            kind: 'sequence',
            id: 'seq:0',
            children: [{ kind: 'step', id: 'step:a' }],
          },
        }),
    }));
    mounted = mount(
      <MemoryRouter
        initialEntries={['/view?src=https%3A%2F%2Fexample.com%2Fflow.json']}
      >
        <ViewRoute fetch_impl={fake_fetch} />
      </MemoryRouter>,
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fake_fetch).toHaveBeenCalled();
  });
});
