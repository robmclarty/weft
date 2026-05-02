import { afterEach, describe, expect, it } from 'vitest';

import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { Banner } from '../Banner.js';

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

describe('Banner', () => {
  it('renders the children with the requested tone', () => {
    mounted = mount(<Banner tone="warn">hello</Banner>);
    const banner = mounted.container.querySelector('[data-tone="warn"]');
    expect(banner?.textContent).toContain('hello');
  });

  it('renders an action when provided', () => {
    mounted = mount(
      <Banner tone="error" action={<button type="button">try again</button>}>
        oops
      </Banner>,
    );
    const button = mounted.container.querySelector('button');
    expect(button?.textContent).toBe('try again');
  });
});
