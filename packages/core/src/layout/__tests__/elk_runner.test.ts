import { describe, expect, it } from 'vitest';

import { flow_tree_schema } from '../../schemas.js';
import { load_fixture_raw } from '../../test_helpers.js';
import { tree_to_graph, type WeftEdge, type WeftNode } from '../../transform/tree_to_graph.js';
import {
  apply_edge_routes,
  apply_positions,
  build_elk,
  build_elk_graph,
  resolve_worker_factory,
} from '../elk_runner.js';
import { resolve_options } from '../layout_options.js';

function graph_for(name: string): { nodes: WeftNode[]; edges: WeftEdge[] } {
  const tree = flow_tree_schema.parse(load_fixture_raw(name));
  return tree_to_graph(tree);
}

describe('build_elk_graph', () => {
  it('emits an LR-direction layered ELK graph with weft-supplied spacing', () => {
    const { nodes, edges } = graph_for('simple_sequence.json');
    const graph = build_elk_graph(nodes, edges, resolve_options());
    expect(graph.id).toBe('__weft_root');
    expect(graph.layoutOptions?.['elk.algorithm']).toBe('layered');
    expect(graph.layoutOptions?.['elk.direction']).toBe('RIGHT');
    expect(graph.layoutOptions?.['elk.spacing.nodeNode']).toBe('56');
    expect(graph.layoutOptions?.['elk.layered.spacing.nodeNodeBetweenLayers']).toBe('96');
    expect(graph.layoutOptions?.['elk.edgeRouting']).toBe('ORTHOGONAL');
    expect(graph.layoutOptions?.['elk.hierarchyHandling']).toBe('INCLUDE_CHILDREN');
  });

  it('switches direction to DOWN for TB', () => {
    const { nodes, edges } = graph_for('simple_sequence.json');
    const graph = build_elk_graph(nodes, edges, resolve_options({ direction: 'TB' }));
    expect(graph.layoutOptions?.['elk.direction']).toBe('DOWN');
  });

  it('annotates parallel containers with FIXED_ORDER and one port per fan-out edge', () => {
    const { nodes, edges } = graph_for('parallel_ordering.json');
    const graph = build_elk_graph(nodes, edges, resolve_options());
    const par = graph.children?.find((c) => c.id === 'par:ordered');
    expect(par).toBeDefined();
    expect(par?.layoutOptions?.['org.eclipse.elk.portConstraints']).toBe('FIXED_ORDER');
    const port_ids = par?.ports?.map((p) => p.id) ?? [];
    // 1 input + 4 fan-out outputs
    expect(port_ids.length).toBe(5);
    expect(port_ids[0]).toBe('par:ordered::in');
    expect(port_ids.slice(1)).toEqual([
      'par:ordered::out:par:ordered/step:first',
      'par:ordered::out:par:ordered/step:second',
      'par:ordered::out:par:ordered/step:third',
      'par:ordered::out:par:ordered/step:fourth',
    ]);
  });

  it('sets nodeSize constraints, minimum size, and padding on container nodes that have children', () => {
    const { nodes, edges } = graph_for('full_primitive_set.json');
    const graph = build_elk_graph(nodes, edges, resolve_options());
    const seq = graph.children?.find((c) => c.id === 'seq:everything');
    expect(seq?.children?.length).toBeGreaterThan(0);
    expect(seq?.layoutOptions?.['org.eclipse.elk.nodeSize.constraints']).toBe(
      '[NODE_LABELS, PORTS, MINIMUM_SIZE]',
    );
    expect(seq?.layoutOptions?.['org.eclipse.elk.nodeSize.minimum']).toBeDefined();
    expect(seq?.layoutOptions?.['org.eclipse.elk.padding']).toContain('top=');
  });

  it('produces sources/targets pairs for every weft edge', () => {
    const { nodes, edges } = graph_for('simple_sequence.json');
    const graph = build_elk_graph(nodes, edges, resolve_options());
    expect(graph.edges?.length).toBe(edges.length);
    for (const e of graph.edges ?? []) {
      expect(e.sources?.length).toBe(1);
      expect(e.targets?.length).toBe(1);
    }
  });
});

describe('apply_positions', () => {
  it('writes parent-relative coordinates straight through; never sums parent offsets', () => {
    const nodes: WeftNode[] = [
      {
        id: 'parent',
        type: 'sequence',
        position: { x: 0, y: 0 },
        data: { kind: 'sequence', id: 'parent' },
      },
      {
        id: 'parent/child',
        type: 'step',
        parentId: 'parent',
        position: { x: 0, y: 0 },
        data: { kind: 'step', id: 'child' },
      },
    ];
    const laid_root = {
      id: '__weft_root',
      children: [
        {
          id: 'parent',
          x: 100,
          y: 200,
          width: 400,
          height: 300,
          children: [
            { id: 'parent/child', x: 12, y: 24, width: 200, height: 80 },
          ],
        },
      ],
    };
    const result = apply_positions(nodes, laid_root);
    const parent = result.find((n) => n.id === 'parent');
    const child = result.find((n) => n.id === 'parent/child');
    expect(parent?.position).toEqual({ x: 100, y: 200 });
    // Critical: parent-relative — NOT 100+12 / 200+24.
    expect(child?.position).toEqual({ x: 12, y: 24 });
  });

  it('returns nodes untouched when ELK output is missing them (defensive copy)', () => {
    const nodes: WeftNode[] = [
      {
        id: 'a',
        type: 'step',
        position: { x: 5, y: 5 },
        data: { kind: 'step', id: 'a' },
      },
    ];
    const result = apply_positions(nodes, { id: '__weft_root', children: [] });
    expect(result.length).toBe(1);
    expect(result[0]?.position).toEqual({ x: 5, y: 5 });
  });
});

describe('apply_edge_routes', () => {
  it('writes ELK section waypoints (root-space) onto matching edges as data.waypoints', () => {
    const edges: WeftEdge[] = [
      { id: 'e1', source: 'a', target: 'b', data: { kind: 'structural' } },
    ];
    const laid_root = {
      id: '__weft_root',
      children: [
        { id: 'a', x: 0, y: 0, width: 100, height: 50 },
        { id: 'b', x: 200, y: 0, width: 100, height: 50 },
      ],
      edges: [
        {
          id: 'e1',
          sources: ['a'],
          targets: ['b'],
          sections: [
            {
              id: 's1',
              startPoint: { x: 100, y: 25 },
              bendPoints: [{ x: 150, y: 25 }, { x: 150, y: 25 }],
              endPoint: { x: 200, y: 25 },
            },
          ],
        },
      ],
    };
    const out = apply_edge_routes(edges, laid_root);
    expect(out[0]?.data?.waypoints).toEqual([
      { x: 100, y: 25 },
      { x: 150, y: 25 },
      { x: 150, y: 25 },
      { x: 200, y: 25 },
    ]);
  });

  it('translates edge waypoints by ancestor offsets so they land in root (flow) space', () => {
    // ELK stores edge sections relative to the edge's container. Walk a
    // 2-deep nesting and verify that ancestor offsets accumulate.
    const edges: WeftEdge[] = [
      { id: 'e1', source: 'a', target: 'b', data: { kind: 'structural' } },
    ];
    const laid_root = {
      id: '__weft_root',
      children: [
        {
          id: 'outer',
          x: 100,
          y: 200,
          children: [
            {
              id: 'inner',
              x: 10,
              y: 20,
              edges: [
                {
                  id: 'e1',
                  sources: ['a'],
                  targets: ['b'],
                  sections: [
                    {
                      id: 's1',
                      startPoint: { x: 5, y: 6 },
                      endPoint: { x: 15, y: 16 },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const out = apply_edge_routes(edges, laid_root);
    // 100 + 10 + 5 = 115, 200 + 20 + 6 = 226
    // 100 + 10 + 15 = 125, 200 + 20 + 16 = 236
    expect(out[0]?.data?.waypoints).toEqual([
      { x: 115, y: 226 },
      { x: 125, y: 236 },
    ]);
  });

  it('omits waypoints when ELK returns no sections for the edge', () => {
    const edges: WeftEdge[] = [
      { id: 'e1', source: 'a', target: 'b', data: { kind: 'structural' } },
    ];
    const laid_root = {
      id: '__weft_root',
      edges: [{ id: 'e1', sources: ['a'], targets: ['b'] }],
    };
    const out = apply_edge_routes(edges, laid_root);
    expect(out[0]?.data?.waypoints).toBeUndefined();
  });

  it('preserves existing edge data (kind/role/wrapper_label) when adding waypoints', () => {
    const edges: WeftEdge[] = [
      {
        id: 'e1',
        source: 'a',
        target: 'b',
        data: { kind: 'pipe-fn', wrapper_id: 'w1', wrapper_label: '<fn:foo>' },
      },
    ];
    const laid_root = {
      id: '__weft_root',
      edges: [
        {
          id: 'e1',
          sources: ['a'],
          targets: ['b'],
          sections: [
            { id: 's', startPoint: { x: 0, y: 0 }, endPoint: { x: 10, y: 0 } },
          ],
        },
      ],
    };
    const out = apply_edge_routes(edges, laid_root);
    expect(out[0]?.data?.kind).toBe('pipe-fn');
    expect(out[0]?.data?.wrapper_label).toBe('<fn:foo>');
    expect(out[0]?.data?.waypoints).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
  });
});

describe('resolve_worker_factory', () => {
  it('returns undefined when caller passes null (forces in-thread fallback)', () => {
    expect(resolve_worker_factory(null)).toBeUndefined();
  });

  it('returns undefined when no Worker global is present and no caller factory', () => {
    // In Node test env, `Worker` is undefined.
    expect(resolve_worker_factory(undefined)).toBeUndefined();
  });

  it('returns the caller-supplied factory verbatim when one is given', () => {
    expect(resolve_worker_factory(fake_worker)).toBe(fake_worker);
  });
});

function fake_worker(): Worker {
  return {
    postMessage: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    terminate: () => undefined,
    onmessage: null,
    onerror: null,
  } as unknown as Worker;
}

describe('build_elk', () => {
  it('constructs an ELK instance when given a workable factory', () => {
    // We don't actually call .layout() here — that needs a real worker. We
    // just verify the constructor accepts the factory.
    const elk = build_elk(fake_worker);
    expect(typeof elk.layout).toBe('function');
  });
});
