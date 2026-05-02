import { afterEach, describe, expect, it } from 'vitest';

import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

import { EmptyRoute } from '../EmptyRoute.js';

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

describe('EmptyRoute', () => {
  it('renders the loader and the empty canvas message', () => {
    mounted = mount(
      <MemoryRouter>
        <EmptyRoute />
      </MemoryRouter>,
    );
    expect(mounted.container.querySelector('[data-weft-route="empty"]')).not.toBeNull();
    expect(mounted.container.textContent).toContain('load');
  });
});
