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
    expect(graph.layoutOptions?.['elk.spacing.nodeNode']).toBe('120');
    expect(graph.layoutOptions?.['elk.layered.spacing.nodeNodeBetweenLayers']).toBe('200');
    expect(graph.layoutOptions?.['elk.edgeRouting']).toBe('ORTHOGONAL');
    expect(graph.layoutOptions?.['elk.hierarchyHandling']).toBe('INCLUDE_CHILDREN');
  });

  it('switches direction to DOWN for TB', () => {
    const { nodes, edges } = graph_for('simple_sequence.json');
    const graph = build_elk_graph(nodes, edges, resolve_options({ direction: 'TB' }));
    expect(graph.layoutOptions?.['elk.direction']).toBe('DOWN');
  });

  it('annotates parallel containers with FIXED_POS and one port per fan-out edge', () => {
    const { nodes, edges } = graph_for('parallel_ordering.json');
    const graph = build_elk_graph(nodes, edges, resolve_options());
    const par = graph.children?.find((c) => c.id === 'par:ordered');
    expect(par).toBeDefined();
    // FIXED_POS pins each port at the diamond's vertex so ELK can't
    // shift the path endpoint off the visual corner during routing.
    expect(par?.layoutOptions?.['org.eclipse.elk.portConstraints']).toBe('FIXED_POS');
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
    // Input port pinned to the diamond's left vertex (x=0, y=h/2).
    const in_port = par?.ports?.find((p) => p.id === 'par:ordered::in');
    expect(in_port?.x).toBe(0);
    expect(in_port?.y).toBe(28);
  });

  it('sets nodeSize constraints, minimum size, and padding on container nodes that have children', () => {
    // After the visual-simplification pass, only `compose` (when
    // expanded) is a parent-grouping container. `all_primitives.json`'s
    // root is a compose; its inner subgraph hosts every other kind.
    const { nodes, edges } = graph_for('all_primitives.json');
    const graph = build_elk_graph(nodes, edges, resolve_options());
    const compose = graph.children?.find((c) => c.id === 'agent_pipeline_1');
    expect(compose?.children?.length).toBeGreaterThan(0);
    expect(compose?.layoutOptions?.['org.eclipse.elk.nodeSize.constraints']).toBe(
      '[NODE_LABELS, PORTS, MINIMUM_SIZE]',
    );
    expect(compose?.layoutOptions?.['org.eclipse.elk.nodeSize.minimum']).toBeDefined();
    expect(compose?.layoutOptions?.['org.eclipse.elk.padding']).toContain('top=');
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

  it('annotates branch / fallback junctions with FIXED_POS ports (happy=EAST, alt=SOUTH)', () => {
    // Build a minimal graph by hand so the assertion doesn't depend on
    // fixture structure. Two junctions at root: one branch (then/otherwise),
    // one fallback (primary/backup).
    const nodes: WeftNode[] = [
      { id: 'br', type: 'branch', position: { x: 0, y: 0 }, width: 56, height: 56, data: { kind: 'branch', id: 'br' } },
      { id: 'fb', type: 'fallback', position: { x: 0, y: 0 }, width: 56, height: 56, data: { kind: 'fallback', id: 'fb' } },
      { id: 'a', type: 'step', position: { x: 0, y: 0 }, data: { kind: 'step', id: 'a' } },
      { id: 'b', type: 'step', position: { x: 0, y: 0 }, data: { kind: 'step', id: 'b' } },
    ];
    const edges: WeftEdge[] = [
      { id: 'e1', source: 'br', target: 'a', sourceHandle: 'out:then', data: { kind: 'structural', role: 'then' } },
      { id: 'e2', source: 'br', target: 'b', sourceHandle: 'out:otherwise', data: { kind: 'structural', role: 'otherwise' } },
      { id: 'e3', source: 'fb', target: 'a', sourceHandle: 'out:primary', data: { kind: 'structural', role: 'primary' } },
      { id: 'e4', source: 'fb', target: 'b', sourceHandle: 'out:backup', data: { kind: 'structural', role: 'backup' } },
    ];
    const graph = build_elk_graph(nodes, edges, resolve_options());

    const branch = graph.children?.find((c) => c.id === 'br');
    expect(branch?.layoutOptions?.['org.eclipse.elk.portConstraints']).toBe('FIXED_POS');
    const branch_ports = branch?.ports ?? [];
    expect(branch_ports.find((p) => p.id === 'br::in')?.layoutOptions?.['org.eclipse.elk.port.side']).toBe('WEST');
    expect(branch_ports.find((p) => p.id === 'br::out:then')?.layoutOptions?.['org.eclipse.elk.port.side']).toBe('EAST');
    expect(branch_ports.find((p) => p.id === 'br::out:otherwise')?.layoutOptions?.['org.eclipse.elk.port.side']).toBe('SOUTH');

    const fallback = graph.children?.find((c) => c.id === 'fb');
    expect(fallback?.layoutOptions?.['org.eclipse.elk.portConstraints']).toBe('FIXED_POS');
    const fallback_ports = fallback?.ports ?? [];
    expect(fallback_ports.find((p) => p.id === 'fb::out:primary')?.layoutOptions?.['org.eclipse.elk.port.side']).toBe('EAST');
    expect(fallback_ports.find((p) => p.id === 'fb::out:backup')?.layoutOptions?.['org.eclipse.elk.port.side']).toBe('SOUTH');
  });

  it('binds branch / fallback edges to specific ports via `sources`', () => {
    // The FIXED_POS port placement only takes effect when ELK can match
    // each edge to its declared port. A branch's `then` edge must list
    // `<branch>::out:then` as its source, not the bare junction id.
    const nodes: WeftNode[] = [
      { id: 'br', type: 'branch', position: { x: 0, y: 0 }, width: 56, height: 56, data: { kind: 'branch', id: 'br' } },
      { id: 'a', type: 'step', position: { x: 0, y: 0 }, data: { kind: 'step', id: 'a' } },
      { id: 'b', type: 'step', position: { x: 0, y: 0 }, data: { kind: 'step', id: 'b' } },
    ];
    const edges: WeftEdge[] = [
      { id: 'e1', source: 'br', target: 'a', sourceHandle: 'out:then', data: { kind: 'structural', role: 'then' } },
      { id: 'e2', source: 'br', target: 'b', sourceHandle: 'out:otherwise', data: { kind: 'structural', role: 'otherwise' } },
    ];
    const graph = build_elk_graph(nodes, edges, resolve_options());
    const elk_edges = graph.edges ?? [];
    const e1 = elk_edges.find((e) => e.id === 'e1');
    const e2 = elk_edges.find((e) => e.id === 'e2');
    expect(e1?.sources?.[0]).toBe('br::out:then');
    expect(e2?.sources?.[0]).toBe('br::out:otherwise');
  });

  it('does not bind sequence/structural edges to ports (only branch/fallback junctions get sourcePort)', () => {
    // Regression: a plain step → step edge must not be rewritten to a port id.
    const { nodes, edges } = graph_for('simple_sequence.json');
    const graph = build_elk_graph(nodes, edges, resolve_options());
    for (const e of graph.edges ?? []) {
      expect(e.sources?.[0]).not.toMatch(/::out:/);
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
