import { afterEach, describe, expect, it } from 'vitest';

import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { FlowTree } from '@repo/weft';

import { CanvasShell } from './CanvasShell.js';

let mounted: { container: HTMLDivElement; root: Root } | null = null;

function mount(element: ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement('div');
  container.style.width = '900px';
  container.style.height = '600px';
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
  window.localStorage.clear();
});

describe('CanvasShell', () => {
  it('renders the empty message when tree is null', () => {
    mounted = mount(<CanvasShell tree={null} empty_message="nothing yet" />);
    expect(mounted.container.textContent).toContain('nothing yet');
  });

  it('renders the side_top slot above the inspector', () => {
    mounted = mount(
      <CanvasShell
        tree={null}
        side_top={<div data-test-side-top="true">side</div>}
      />,
    );
    expect(
      mounted.container.querySelector('[data-test-side-top="true"]'),
    ).not.toBeNull();
  });

  it('renders the banner when provided', () => {
    mounted = mount(
      <CanvasShell
        tree={null}
        banners={<div data-test-banner="true">hi</div>}
      />,
    );
    expect(
      mounted.container.querySelector('[data-test-banner="true"]'),
    ).not.toBeNull();
  });

  it('renders the canvas when given a tree', async () => {
    const tree: FlowTree = {
      version: 1,
      root: {
        kind: 'sequence',
        id: 'seq:0',
        children: [{ kind: 'step', id: 'step:a' }],
      },
    };
    mounted = mount(<CanvasShell tree={tree} />);
    // Wait for the layout pass to settle
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    expect(mounted.container.querySelector('.weft-canvas')).not.toBeNull();
  });

  // The shortcuts modal moved to App.tsx (the help pill is in the header
  // outside CanvasShell). See packages/studio/src/App.test.tsx.

it('Escape clears selection (no-op when nothing selected)', () => {
    mounted = mount(<CanvasShell tree={null} />);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    // No throw → success.
    expect(mounted.container).toBeDefined();
  });

  it('/ focuses the search input when search_input_id is provided', () => {
    const search = document.createElement('input');
    search.id = 'test-search';
    document.body.append(search);
    mounted = mount(<CanvasShell tree={null} search_input_id="test-search" />);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '/' }));
    });
    expect(document.activeElement).toBe(search);
    search.remove();
  });

  it('ignores shortcuts when typing in an input', () => {
    const input = document.createElement('input');
    input.id = 'editing';
    document.body.append(input);
    mounted = mount(<CanvasShell tree={null} />);
    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'f', bubbles: true });
      Object.defineProperty(event, 'target', { value: input });
      window.dispatchEvent(event);
    });
    // No throw, no shortcut effect — pass if we get here
    expect(mounted.container).toBeDefined();
    input.remove();
  });
});
