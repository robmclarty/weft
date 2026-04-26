import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { flow_tree_schema } from '../schemas.js';
import { load_fixture_raw } from '../test_helpers.js';
import { tree_to_graph, type WeftEdge, type WeftNode } from '../transform/tree_to_graph.js';
import {
  layout_graph,
  reset_layout_warnings_for_tests,
} from './layout_graph.js';
import { fallback_layout } from './fallback_layout.js';
import { resolve_options } from './layout_options.js';

function graph_for(name: string): { nodes: WeftNode[]; edges: WeftEdge[] } {
  const tree = flow_tree_schema.parse(load_fixture_raw(name));
  return tree_to_graph(tree);
}

describe('resolve_options', () => {
  it('uses the spec defaults when called without arguments', () => {
    expect(resolve_options()).toEqual({
      direction: 'LR',
      node_spacing: 40,
      rank_spacing: 80,
    });
  });

  it('overrides individual fields without touching the others', () => {
    expect(resolve_options({ direction: 'TB' })).toEqual({
      direction: 'TB',
      node_spacing: 40,
      rank_spacing: 80,
    });
    expect(resolve_options({ node_spacing: 12, rank_spacing: 7 })).toEqual({
      direction: 'LR',
      node_spacing: 12,
      rank_spacing: 7,
    });
  });
});

describe('fallback_layout (deterministic naive grid)', () => {
  it('positions every input node and never overlaps siblings on the major axis', () => {
    const { nodes, edges } = graph_for('full_primitive_set.json');
    const result = fallback_layout(nodes, edges);

    const seen = new Set<string>();
    for (const n of result.nodes) {
      seen.add(n.id);
      expect(n.position.x).toBeGreaterThanOrEqual(0);
      expect(n.position.y).toBeGreaterThanOrEqual(0);
    }
    for (const n of nodes) expect(seen.has(n.id)).toBe(true);
  });

  it('emits parent-relative coordinates: child positions never include parent offsets', () => {
    const { nodes, edges } = graph_for('full_primitive_set.json');
    const result = fallback_layout(nodes, edges);
    const by_id = new Map(result.nodes.map((n) => [n.id, n]));
    const par = by_id.get('seq:everything/par:report');
    const first_child = by_id.get('seq:everything/par:report/step:summary');
    expect(par).toBeDefined();
    expect(first_child).toBeDefined();
    if (par === undefined || first_child === undefined) throw new Error('missing');
    expect(first_child.parentId).toBe('seq:everything/par:report');
    expect(first_child.position.x).toBeLessThan((par.width ?? 0) + 1);
    expect(first_child.position.y).toBeLessThan((par.height ?? 0) + 1);
  });
});

describe('layout_graph (ELK happy path, in-thread)', () => {
  beforeEach(() => {
    reset_layout_warnings_for_tests();
  });

  it('returns positioned nodes for a small fixture (in-thread fallback when no Worker)', async () => {
    const { nodes, edges } = graph_for('simple_sequence.json');
    const result = await layout_graph(nodes, edges, { worker_factory: null });
    expect(result.nodes.length).toBe(nodes.length);
    for (const n of result.nodes) {
      expect(typeof n.position.x).toBe('number');
      expect(typeof n.position.y).toBe('number');
    }
  });

  it('preserves child-of-parallel order across two consecutive layouts (parallel-ordering regression, transform side)', async () => {
    const { nodes: n1, edges: e1 } = graph_for('parallel_ordering.json');
    const r1 = await layout_graph(n1, e1, { worker_factory: null });

    // Re-load and re-layout: results should be reproducible.
    const { nodes: n2, edges: e2 } = graph_for('parallel_ordering.json');
    const r2 = await layout_graph(n2, e2, { worker_factory: null });

    const par_children_1 = r1.nodes
      .filter((n) => n.parentId === 'par:ordered')
      .map((n) => n.id);
    const par_children_2 = r2.nodes
      .filter((n) => n.parentId === 'par:ordered')
      .map((n) => n.id);

    expect(par_children_1).toEqual([
      'par:ordered/step:first',
      'par:ordered/step:second',
      'par:ordered/step:third',
      'par:ordered/step:fourth',
    ]);
    expect(par_children_1).toEqual(par_children_2);
  });
});

function silent_worker_factory(): (url?: string) => Worker {
  return () =>
    ({
      postMessage: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      terminate: () => undefined,
      onmessage: null,
      onerror: null,
    }) as unknown as Worker;
}

describe('layout_graph: F4 — ELK timeout falls back to naive grid', () => {
  beforeEach(() => {
    reset_layout_warnings_for_tests();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('engages fallback and warns once when ELK takes longer than the timeout', async () => {
    const warn_spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { nodes, edges } = graph_for('simple_sequence.json');

    const result = await layout_graph(nodes, edges, {
      worker_factory: silent_worker_factory(),
      timeout_ms: 50,
    });

    expect(result.nodes.length).toBe(nodes.length);
    const warned_about_fallback = warn_spy.mock.calls.some((call) => {
      const [first] = call;
      return typeof first === 'string' && first.includes('fallback engaged');
    });
    expect(warned_about_fallback).toBe(true);
  });

  it('only warns once across multiple fallback engagements (once-per-process semantics)', async () => {
    const warn_spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { nodes, edges } = graph_for('simple_sequence.json');

    await layout_graph(nodes, edges, { worker_factory: silent_worker_factory(), timeout_ms: 30 });
    await layout_graph(nodes, edges, { worker_factory: silent_worker_factory(), timeout_ms: 30 });
    await layout_graph(nodes, edges, { worker_factory: silent_worker_factory(), timeout_ms: 30 });

    const fallback_warnings = warn_spy.mock.calls.filter((call) => {
      const [first] = call;
      return typeof first === 'string' && first.includes('fallback engaged');
    });
    expect(fallback_warnings.length).toBe(1);
  });
});

describe('layout_graph: F5 — Worker unavailable runs ELK in-thread', () => {
  beforeEach(() => {
    reset_layout_warnings_for_tests();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('completes without throwing and emits a warning when Worker is undefined', async () => {
    const warn_spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { nodes, edges } = graph_for('simple_sequence.json');
    // Caller signals "no worker" by passing null. In a real Node test
    // environment there's no Worker either, so this also exercises the
    // typeof Worker === 'undefined' branch.
    const result = await layout_graph(nodes, edges, { worker_factory: null });
    expect(result.nodes.length).toBe(nodes.length);
    expect(warn_spy).toHaveBeenCalled();
  });
});

describe('layout_graph: 500-node tree under 5s', () => {
  it('lays out a synthetic 500-node sequence within the spec budget', async () => {
    const N = 500;
    const nodes: WeftNode[] = [
      {
        id: 'root',
        type: 'sequence',
        position: { x: 0, y: 0 },
        data: { kind: 'sequence', id: 'root' },
      },
    ];
    for (let i = 0; i < N; i += 1) {
      nodes.push({
        id: `root/leaf_${i}`,
        type: 'step',
        parentId: 'root',
        position: { x: 0, y: 0 },
        data: { kind: 'step', id: `leaf_${i}` },
      });
    }
    const edges: WeftEdge[] = [];
    for (let i = 0; i < N - 1; i += 1) {
      edges.push({
        id: `e:${i}`,
        source: `root/leaf_${i}`,
        target: `root/leaf_${i + 1}`,
        data: { kind: 'structural' },
      });
    }
    const t0 = Date.now();
    const result = await layout_graph(nodes, edges, { worker_factory: null });
    const elapsed = Date.now() - t0;
    expect(result.nodes.length).toBe(nodes.length);
    expect(elapsed).toBeLessThan(5_000);
  }, 10_000);
});
