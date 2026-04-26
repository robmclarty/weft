/**
 * Browser-mode component tests for the node registry.
 *
 * Runs under `@vitest/browser` (Chromium). Uses real DOM to verify that each
 * v0 kind renders the visual encoding spec §4.3 prescribes.
 */

import { afterEach, describe, expect, it } from 'vitest';

import type { WeftEdge, WeftNode } from '../transform/tree_to_graph.js';
import { mount_canvas, type MountedCanvas } from './render_helpers.js';

let mounted: MountedCanvas | null = null;

afterEach(() => {
  if (mounted !== null) {
    mounted.unmount();
    mounted = null;
  }
});

function leaf(id: string, kind: string, extra?: Partial<WeftNode>): WeftNode {
  return {
    id,
    type: kind,
    position: { x: 100, y: 100 },
    data: { kind, id },
    ...extra,
  };
}

describe('StepNode', () => {
  it('renders the id label and the function reference', async () => {
    const nodes: WeftNode[] = [
      {
        id: 'step:1',
        type: 'step',
        position: { x: 50, y: 50 },
        data: {
          kind: 'step',
          id: 'step:1',
          config: { fn: { kind: '<fn>', name: 'do_thing' } },
        },
      },
    ];
    mounted = mount_canvas(nodes, []);
    const node = mounted.container.querySelector('[data-weft-kind="step"]');
    expect(node).not.toBeNull();
    expect(node?.textContent).toContain('step:1');
    expect(node?.textContent).toContain('<fn:do_thing>');
  });

  it('renders an anonymous fn ref when name is absent', async () => {
    const nodes: WeftNode[] = [
      {
        id: 'step:2',
        type: 'step',
        position: { x: 0, y: 0 },
        data: { kind: 'step', id: 'step:2', config: { fn: { kind: '<fn>' } } },
      },
    ];
    mounted = mount_canvas(nodes, []);
    const node = mounted.container.querySelector('[data-weft-kind="step"]');
    expect(node?.textContent).toContain('<fn>');
  });
});

describe('SequenceNode', () => {
  it('renders a sequence chrome with id and badge', () => {
    mounted = mount_canvas([leaf('seq:root', 'sequence')], []);
    const node = mounted.container.querySelector('[data-weft-kind="sequence"]');
    expect(node?.textContent).toContain('seq:root');
    expect(node?.textContent?.toLowerCase()).toContain('sequence');
  });
});

describe('ParallelNode', () => {
  it('declares one source handle per key plus an input handle', () => {
    const nodes: WeftNode[] = [
      {
        id: 'par:1',
        type: 'parallel',
        position: { x: 0, y: 0 },
        data: { kind: 'parallel', id: 'par:1', config: { keys: ['a', 'b', 'c'] } },
      },
    ];
    mounted = mount_canvas(nodes, []);
    const par = mounted.container.querySelector('[data-weft-kind="parallel"]');
    expect(par).not.toBeNull();
    expect(par?.textContent).toContain('parallel × 3');
    const handles = par?.querySelectorAll('.react-flow__handle') ?? [];
    expect(handles.length).toBe(4);
    const port_keys = Array.from(par?.querySelectorAll('[data-weft-port-key]') ?? []).map(
      (h) => h.getAttribute('data-weft-port-key'),
    );
    expect(port_keys).toEqual(['a', 'b', 'c']);
  });
});

describe('PipeNode and RetryNode', () => {
  it('renders pipe chrome with the tail fn label', () => {
    const nodes: WeftNode[] = [
      {
        id: 'pipe:1',
        type: 'pipe',
        position: { x: 0, y: 0 },
        data: {
          kind: 'pipe',
          id: 'pipe:1',
          config: { fn: { kind: '<fn>', name: 'upper' } },
        },
      },
    ];
    mounted = mount_canvas(nodes, []);
    const node = mounted.container.querySelector('[data-weft-kind="pipe"]');
    expect(node?.textContent).toContain('upper');
  });

  it('renders retry chrome with attempts × backoff badge', () => {
    const nodes: WeftNode[] = [
      {
        id: 'retry:1',
        type: 'retry',
        position: { x: 0, y: 0 },
        data: {
          kind: 'retry',
          id: 'retry:1',
          config: { max_attempts: 3, backoff_ms: 250 },
        },
      },
    ];
    mounted = mount_canvas(nodes, []);
    const node = mounted.container.querySelector('[data-weft-kind="retry"]');
    expect(node?.textContent).toContain('3');
    expect(node?.textContent).toContain('250');
  });
});

describe('ScopeNode + StashNode + UseNode', () => {
  it('renders scope chrome and stash/use badges', () => {
    const nodes: WeftNode[] = [
      leaf('scope:1', 'scope'),
      {
        id: 'stash:1',
        type: 'stash',
        position: { x: 0, y: 0 },
        data: { kind: 'stash', id: 'stash:1', config: { key: 'greeting' } },
      },
      {
        id: 'use:1',
        type: 'use',
        position: { x: 0, y: 0 },
        data: { kind: 'use', id: 'use:1', config: { keys: ['greeting', 'farewell'] } },
      },
    ];
    mounted = mount_canvas(nodes, []);
    expect(mounted.container.querySelector('[data-weft-kind="scope"]')?.textContent).toContain('scope');
    expect(mounted.container.querySelector('[data-weft-kind="stash"]')?.textContent).toContain('greeting');
    const use_node = mounted.container.querySelector('[data-weft-kind="use"]');
    expect(use_node?.textContent).toContain('greeting');
    expect(use_node?.textContent).toContain('farewell');
  });
});

describe('GenericNode (F6: unknown kinds)', () => {
  it('renders unknown kinds without throwing and surfaces an "unknown" label', () => {
    const nodes: WeftNode[] = [
      {
        id: 'unknown:1',
        type: 'generic',
        position: { x: 0, y: 0 },
        data: { kind: 'fancy_new_kind', id: 'unknown:1', generic: true },
      },
    ];
    mounted = mount_canvas(nodes, []);
    const node = mounted.container.querySelector('[data-weft-generic="true"]');
    expect(node?.textContent?.toLowerCase()).toContain('unknown');
    expect(node?.textContent).toContain('fancy_new_kind');
  });

  it('renders the cycle-guard variant when warning="cycle-guard"', () => {
    const nodes: WeftNode[] = [
      {
        id: 'guarded:1',
        type: 'generic',
        position: { x: 0, y: 0 },
        data: { kind: 'sequence', id: 'guarded:1', warning: 'cycle-guard' },
      },
    ];
    mounted = mount_canvas(nodes, []);
    const node = mounted.container.querySelector('[data-weft-generic="true"]');
    expect(node?.textContent).toContain('cycle-guard');
  });
});

describe('CycleNode (<cycle> sentinel)', () => {
  it('renders the cycle-target id badge', () => {
    const nodes: WeftNode[] = [
      {
        id: 'cycle:1',
        type: 'cycle',
        position: { x: 0, y: 0 },
        data: { kind: '<cycle>', id: 'cycle:1', cycle_target: 'seq:loop' },
      },
    ];
    mounted = mount_canvas(nodes, []);
    const node = mounted.container.querySelector('[data-weft-kind="cycle"]');
    expect(node?.textContent).toContain('cycle');
    expect(node?.textContent).toContain('seq:loop');
  });
});

describe('Registry covers every transform-tagged type', () => {
  it('does not crash when every kind is rendered together', () => {
    const nodes: WeftNode[] = [
      leaf('a', 'step'),
      { id: 'b', type: 'sequence', position: { x: 220, y: 0 }, data: { kind: 'sequence', id: 'b' } },
      { id: 'c', type: 'parallel', position: { x: 440, y: 0 }, data: { kind: 'parallel', id: 'c', config: { keys: [] } } },
      { id: 'd', type: 'pipe', position: { x: 660, y: 0 }, data: { kind: 'pipe', id: 'd' } },
      { id: 'e', type: 'retry', position: { x: 0, y: 220 }, data: { kind: 'retry', id: 'e' } },
      { id: 'f', type: 'scope', position: { x: 220, y: 220 }, data: { kind: 'scope', id: 'f' } },
      { id: 'g', type: 'stash', position: { x: 440, y: 220 }, data: { kind: 'stash', id: 'g', config: { key: 'k' } } },
      { id: 'h', type: 'use', position: { x: 660, y: 220 }, data: { kind: 'use', id: 'h', config: { keys: ['k'] } } },
      { id: 'i', type: 'cycle', position: { x: 0, y: 440 }, data: { kind: '<cycle>', id: 'i', cycle_target: 'a' } },
      { id: 'j', type: 'generic', position: { x: 220, y: 440 }, data: { kind: 'unknown', id: 'j', generic: true } },
    ];
    const edges: WeftEdge[] = [];
    mounted = mount_canvas(nodes, edges);
    for (const n of nodes) {
      const sel = `[data-weft-kind="${n.data.kind === '<cycle>' ? 'cycle' : n.data.kind}"]`;
      expect(mounted.container.querySelector(sel)).not.toBeNull();
    }
  });
});
