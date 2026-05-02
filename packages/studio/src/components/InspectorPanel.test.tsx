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

  it('renders a branch with the predicate and child kinds', () => {
    mounted = mount(
      <InspectorPanel
        selected={{
          kind: 'branch',
          id: 'branch_1',
          config: { when: { kind: '<fn>', name: 'is_long' } },
          children: [
            { kind: 'sequence', id: 'seq:then' },
            { kind: 'step', id: 'step:otherwise' },
          ],
        }}
      />,
    );
    expect(mounted.container.textContent).toContain('is_long');
    expect(mounted.container.textContent).toContain('sequence');
  });

  it('renders a fallback with primary/backup kinds', () => {
    mounted = mount(
      <InspectorPanel
        selected={{
          kind: 'fallback',
          id: 'fallback_1',
          children: [
            { kind: 'step', id: 'step:primary' },
            { kind: 'step', id: 'step:backup' },
          ],
        }}
      />,
    );
    expect(mounted.container.textContent).toContain('primary');
    expect(mounted.container.textContent).toContain('backup');
  });

  it('renders a timeout with the deadline in ms', () => {
    mounted = mount(
      <InspectorPanel
        selected={{
          kind: 'timeout',
          id: 'timeout_1',
          config: { ms: 5000 },
          children: [{ kind: 'step', id: 'inner' }],
        }}
      />,
    );
    expect(mounted.container.textContent).toContain('5000');
  });

  it('renders a loop with max_rounds and guard presence', () => {
    mounted = mount(
      <InspectorPanel
        selected={{
          kind: 'loop',
          id: 'loop_1',
          config: { max_rounds: 5 },
          children: [
            { kind: 'step', id: 'body' },
            { kind: 'step', id: 'guard' },
          ],
        }}
      />,
    );
    expect(mounted.container.textContent).toContain('5');
    expect(mounted.container.textContent).toContain('present');
  });

  it('renders a map with concurrency cap', () => {
    mounted = mount(
      <InspectorPanel
        selected={{
          kind: 'map',
          id: 'map_1',
          config: { concurrency: 4 },
          children: [{ kind: 'step', id: 'per_item' }],
        }}
      />,
    );
    expect(mounted.container.textContent).toContain('4');
  });

  it('renders a checkpoint with a string key', () => {
    mounted = mount(
      <InspectorPanel
        selected={{
          kind: 'checkpoint',
          id: 'checkpoint_1',
          config: { key: 'cache_brief' },
          children: [{ kind: 'step', id: 'inner' }],
        }}
      />,
    );
    expect(mounted.container.textContent).toContain('cache_brief');
  });

  it('renders a compose with the display_name', () => {
    mounted = mount(
      <InspectorPanel
        selected={{
          kind: 'compose',
          id: 'compose_1',
          config: { display_name: 'agent_pipeline' },
          meta: { display_name: 'agent_pipeline' },
          children: [{ kind: 'sequence', id: 'inner' }],
        }}
      />,
    );
    expect(mounted.container.textContent).toContain('agent_pipeline');
  });

  it('renders a suspend with the resume id', () => {
    mounted = mount(
      <InspectorPanel
        selected={{
          kind: 'suspend',
          id: 'approval_gate',
          config: { id: 'approval_gate' },
        }}
      />,
    );
    expect(mounted.container.textContent).toContain('approval_gate');
  });

  it('surfaces the description when meta carries one', () => {
    mounted = mount(
      <InspectorPanel
        selected={{
          kind: 'step',
          id: 'fetch',
          meta: { description: 'reads from the user repo' },
        }}
      />,
    );
    expect(mounted.container.textContent).toContain('reads from the user repo');
  });
});
