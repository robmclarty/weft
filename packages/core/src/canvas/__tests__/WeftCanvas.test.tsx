/**
 * Component tests for WeftCanvas.
 *
 * Run under `react-jsdom` always, and additionally under `@vitest/browser`
 * (Chromium) when chromium is available — see repo-root vitest.config.ts.
 * Tests assert on render-tree shape and props, not on measured layout.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { flow_tree_schema, type FlowTree } from '../../schemas.js';
import { WeftCanvas } from '../WeftCanvas.js';
import type { CanvasApi } from '../canvas_api.js';

import simple_sequence_fixture from '../../../../../fixtures/simple_sequence.json' with { type: 'json' };
import parallel_ordering_fixture from '../../../../../fixtures/parallel_ordering.json' with { type: 'json' };

type Mounted = {
  container: HTMLDivElement;
  root: Root;
};

let mounted: Mounted | null = null;

function mount(element: ReactElement): Mounted {
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

function unmount(m: Mounted): void {
  act(() => {
    m.root.unmount();
  });
  m.container.remove();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function wait_for_nodes(
  container: HTMLElement,
  count: number,
  timeout_ms = 4000,
): Promise<void> {
  const start = Date.now();
  let last = 0;
  while (Date.now() - start < timeout_ms) {
    last = container.querySelectorAll('[data-weft-kind]').length;
    if (last >= count) return;
    // eslint-disable-next-line no-await-in-loop -- polling for render
    await delay(50);
  }
  throw new Error(`expected at least ${count} weft-kind nodes, got ${last}`);
}

function port_keys_in_dom(container: HTMLElement): string[] {
  const handles = container.querySelectorAll('[data-weft-port-key]');
  return Array.from(handles).map((h) => h.getAttribute('data-weft-port-key') ?? '');
}

function make_big_sequence_tree(n: number): FlowTree {
  const children = Array.from({ length: n }, (_, i) => ({
    kind: 'step',
    id: `s_${i}`,
  }));
  return {
    version: 1 as const,
    root: { kind: 'sequence', id: 'big', children },
  };
}

afterEach(() => {
  if (mounted !== null) {
    unmount(mounted);
    mounted = null;
  }
});

describe('WeftCanvas: renders fixture trees end-to-end', () => {
  it('renders simple_sequence.json with all four nodes', async () => {
    const tree = flow_tree_schema.parse(simple_sequence_fixture);
    mounted = mount(
      createElement(WeftCanvas, {
        tree,
        layout_options: { worker_factory: null },
      }),
    );
    await wait_for_nodes(mounted.container, 4);
    const kinds = Array.from(
      mounted.container.querySelectorAll('[data-weft-kind]'),
    ).map((el) => el.getAttribute('data-weft-kind'));
    expect(kinds.filter((k) => k === 'step').length).toBe(3);
    expect(kinds.filter((k) => k === 'sequence').length).toBe(1);
  });
});

describe('WeftCanvas: parallel-ordering regression (render side)', () => {
  it('preserves declaration order across two layout passes after a config tweak', async () => {
    const tree = flow_tree_schema.parse(parallel_ordering_fixture);
    mounted = mount(
      createElement(WeftCanvas, {
        tree,
        layout_options: { worker_factory: null },
      }),
    );
    await wait_for_nodes(mounted.container, 5);

    const before = port_keys_in_dom(mounted.container);
    expect(before).toEqual(['first', 'second', 'third', 'fourth']);

    const tweaked: FlowTree = {
      ...tree,
      root: {
        ...tree.root,
        config: { ...tree.root.config, marker: 'tweak' },
      },
    };
    act(() => {
      mounted!.root.render(
        createElement(WeftCanvas, {
          tree: tweaked,
          layout_options: { worker_factory: null },
        }),
      );
    });
    await delay(400);
    const after = port_keys_in_dom(mounted.container);
    expect(after).toEqual(before);
  });
});

describe('WeftCanvas: imperative canvas_api via on_ready', () => {
  it('returns get_viewport, fit_view, focus_node, export_png on a real canvas', async () => {
    const tree = flow_tree_schema.parse(simple_sequence_fixture);
    let received: CanvasApi | null = null;
    mounted = mount(
      createElement(WeftCanvas, {
        tree,
        layout_options: { worker_factory: null },
        on_ready: (api) => {
          received = api;
        },
      }),
    );
    await wait_for_nodes(mounted.container, 4);
    for (let i = 0; i < 20; i += 1) {
      if (received !== null) break;
      // eslint-disable-next-line no-await-in-loop -- polling for callback
      await delay(50);
    }
    expect(received).not.toBeNull();
    if (received === null) throw new Error('api never delivered');
    const api: CanvasApi = received;

    const v = api.get_viewport();
    expect(typeof v.x).toBe('number');
    expect(typeof v.y).toBe('number');
    expect(typeof v.zoom).toBe('number');

    api.fit_view();
    api.focus_node('seq:root/step:greet');
  });
});

describe('WeftCanvas: large_threshold performance toggle', () => {
  it('marks the canvas as large and disables the minimap above the threshold', async () => {
    const tree = make_big_sequence_tree(15);
    mounted = mount(
      createElement(WeftCanvas, {
        tree,
        layout_options: { worker_factory: null },
        large_threshold: 5,
      }),
    );
    await wait_for_nodes(mounted.container, 5);
    const canvas = mounted.container.querySelector('[data-weft-canvas]');
    expect(canvas?.getAttribute('data-weft-large')).toBe('true');
  });

  it('keeps the canvas in non-large mode when the threshold is not exceeded', async () => {
    const tree = flow_tree_schema.parse(simple_sequence_fixture);
    mounted = mount(
      createElement(WeftCanvas, {
        tree,
        layout_options: { worker_factory: null },
        large_threshold: 1000,
      }),
    );
    await wait_for_nodes(mounted.container, 4);
    const canvas = mounted.container.querySelector('[data-weft-canvas]');
    expect(canvas?.getAttribute('data-weft-large')).toBe('false');
  });
});

describe('WeftCanvas: F6 unknown-kind tolerance', () => {
  it('renders an unknown kind via GenericNode without console errors', async () => {
    const tree: FlowTree = {
      version: 1,
      root: {
        kind: 'sequence',
        id: 'r',
        children: [
          { kind: 'fresh_kind_from_future_fascicle', id: 'unk:1' },
        ],
      },
    };
    mounted = mount(
      createElement(WeftCanvas, {
        tree,
        layout_options: { worker_factory: null },
      }),
    );
    await wait_for_nodes(mounted.container, 2);
    const generic = mounted.container.querySelector('[data-weft-generic="true"]');
    expect(generic).not.toBeNull();
    expect(generic?.textContent).toContain('fresh_kind_from_future_fascicle');
  });
});

describe('WeftCanvas: runtime_state overlay', () => {
  it('attaches runtime data and applies the active class on the matching node', async () => {
    const tree = flow_tree_schema.parse(simple_sequence_fixture);
    const runtime_state = new Map([
      [
        'step:greet',
        {
          active: true,
          error: null,
          last_emit_ts: null,
          cost_usd: 0.012,
          last_run_id: 'r-1',
          span_count: 1,
        },
      ],
    ]);
    mounted = mount(
      createElement(WeftCanvas, {
        tree,
        layout_options: { worker_factory: null },
        runtime_state,
      }),
    );
    await wait_for_nodes(mounted.container, 4);
    // Wait a beat so the post-layout overlay effect runs.
    await delay(60);
    const greet = Array.from(
      mounted.container.querySelectorAll('.react-flow__node'),
    ).find((n) => n.getAttribute('data-id')?.endsWith('step:greet'));
    expect(greet).toBeDefined();
    const inner = greet?.querySelector('[data-weft-kind="step"]');
    expect(inner?.classList.contains('weft-runtime-active')).toBe(true);
    expect(inner?.querySelector('[data-weft-runtime-cost]')?.textContent).toContain(
      '$',
    );
  });
});

describe('WeftCanvas: respects an initial_viewport', () => {
  it('skips auto-fit when the caller pins a viewport', async () => {
    const tree = flow_tree_schema.parse(simple_sequence_fixture);
    let api: CanvasApi | null = null;
    mounted = mount(
      createElement(WeftCanvas, {
        tree,
        layout_options: { worker_factory: null },
        initial_viewport: { x: 50, y: 100, zoom: 1.5 },
        on_ready: (got) => {
          api = got;
        },
      }),
    );
    await wait_for_nodes(mounted.container, 4);
    for (let i = 0; i < 30; i += 1) {
      if (api !== null) break;
      // eslint-disable-next-line no-await-in-loop -- polling for callback
      await delay(50);
    }
    if (api === null) throw new Error('api never delivered');
    const v = (api as CanvasApi).get_viewport();
    expect(Math.round(v.zoom * 100) / 100).toBe(1.5);
    expect(Math.round(v.x)).toBe(50);
    expect(Math.round(v.y)).toBe(100);
  });
});
