import { afterEach, describe, expect, it } from 'vitest';

import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

import { App, SEARCH_INPUT_ID } from './App.js';

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

describe('App', () => {
  it('renders the empty route by default', () => {
    mounted = mount(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    expect(mounted.container.querySelector('[data-weft-route="empty"]')).not.toBeNull();
  });

  it('renders the search input with the exported id', () => {
    mounted = mount(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    expect(mounted.container.querySelector(`#${SEARCH_INPUT_ID}`)).not.toBeNull();
  });

  it('renders the view route', () => {
    mounted = mount(
      <MemoryRouter initialEntries={['/view']}>
        <App />
      </MemoryRouter>,
    );
    expect(mounted.container.querySelector('[data-weft-route="view"]')).not.toBeNull();
  });

  it('renders the watch route', () => {
    mounted = mount(
      <MemoryRouter initialEntries={['/watch']}>
        <App />
      </MemoryRouter>,
    );
    expect(mounted.container.querySelector('[data-weft-route="watch"]')).not.toBeNull();
  });
});
