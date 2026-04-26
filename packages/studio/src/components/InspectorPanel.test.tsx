import { afterEach, describe, expect, it } from 'vitest';

import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { InspectorPanel } from './InspectorPanel.js';

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

describe('InspectorPanel', () => {
  it('shows the empty hint when nothing is selected', () => {
    mounted = mount(<InspectorPanel selected={null} />);
    const empty = mounted.container.querySelector(
      '[data-weft-inspector="empty"]',
    );
    expect(empty?.textContent).toContain('click a node');
  });

  it('renders kind, id, and config for a step', () => {
    mounted = mount(
      <InspectorPanel
        selected={{
          kind: 'step',
          id: 'step:greet',
          config: { fn: { kind: '<fn>', name: 'greet' } },
        }}
      />,
    );
    const panel = mounted.container.querySelector(
      '[data-weft-inspector="node"]',
    );
    expect(panel?.getAttribute('data-weft-inspector-id')).toBe('step:greet');
    expect(panel?.textContent).toContain('step');
    expect(panel?.textContent).toContain('step:greet');
  });

  it('renders the parallel keys list', () => {
    mounted = mount(
      <InspectorPanel
        selected={{
          kind: 'parallel',
          id: 'p:0',
          config: { keys: ['fast', 'slow'] },
          children: [
            { kind: 'step', id: 'step:fast' },
            { kind: 'step', id: 'step:slow' },
          ],
        }}
      />,
    );
    const items = mounted.container.querySelectorAll('li');
    const labels = Array.from(items).map((li) => li.textContent ?? '');
    expect(labels).toContain('fast');
    expect(labels).toContain('slow');
  });

  it('renders the wrapper summary for retry', () => {
    mounted = mount(
      <InspectorPanel
        selected={{
          kind: 'retry',
          id: 'retry:0',
          children: [{ kind: 'step', id: 'step:body' }],
        }}
      />,
    );
    expect(mounted.container.textContent).toContain('wraps');
    expect(mounted.container.textContent).toContain('step:body');
  });
});
