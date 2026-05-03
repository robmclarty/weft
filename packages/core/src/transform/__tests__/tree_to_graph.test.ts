import { describe, expect, it } from 'vitest';

import { flow_tree_schema, type FlowTree } from '../../schemas.js';
import { load_fixture_raw } from '../../test_helpers.js';
import { tree_to_graph, type WeftEdge, type WeftNode } from '../tree_to_graph.js';

function parse_fixture(name: string): FlowTree {
  return flow_tree_schema.parse(load_fixture_raw(name));
}

function find_by_id(nodes: ReadonlyArray<WeftNode>, id: string): WeftNode | undefined {
  return nodes.find((n) => n.id === id);
}

describe('tree_to_graph: simple_sequence.json', () => {
  it('emits the parent and three children with structural edges between them', () => {
    const tree = parse_fixture('simple_sequence.json');
    const { nodes, edges } = tree_to_graph(tree);

    expect(nodes.map((n) => n.id)).toEqual([
      'seq:root',
      'seq:root/step:greet',
      'seq:root/step:farewell',
      'seq:root/step:cleanup',
    ]);

    const sequence_node = nodes[0];
    expect(sequence_node?.type).toBe('sequence');
    expect(sequence_node?.parentId).toBeUndefined();

    for (const child of nodes.slice(1)) {
      expect(child.type).toBe('step');
      expect(child.parentId).toBe('seq:root');
    }

    const sequence_edges = edges.filter((e) => e.data?.kind === 'structural');
    expect(sequence_edges.map((e) => `${e.source}->${e.target}`)).toEqual([
      'seq:root/step:greet->seq:root/step:farewell',
      'seq:root/step:farewell->seq:root/step:cleanup',
    ]);
  });
});

describe('tree_to_graph: parent-prefixed ids', () => {
  it('disambiguates colliding local ids at different depths', () => {
    const tree: FlowTree = {
      version: 1,
      root: {
        kind: 'sequence',
        id: 'root',
        children: [
          {
            kind: 'sequence',
            id: 'inner',
            children: [{ kind: 'step', id: 'duplicate' }],
          },
          { kind: 'step', id: 'duplicate' },
        ],
      },
    };

    const { nodes } = tree_to_graph(tree);
    const ids = nodes.map((n) => n.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
    expect(ids).toContain('root/inner/duplicate');
    expect(ids).toContain('root/duplicate');
  });
});

describe('tree_to_graph: depth-first parent-before-child ordering', () => {
  it('keeps parents earlier in the array than their descendants in nested_parallel.json', () => {
    const tree = parse_fixture('nested_parallel.json');
    const { nodes } = tree_to_graph(tree);
    const positions = new Map<string, number>();
    nodes.forEach((n, i) => positions.set(n.id, i));
    for (const node of nodes) {
      if (node.parentId === undefined) continue;
      const parent_pos = positions.get(node.parentId);
      const child_pos = positions.get(node.id);
      expect(parent_pos).toBeDefined();
      expect(child_pos).toBeDefined();
      expect(parent_pos as number).toBeLessThan(child_pos as number);
    }
  });
});

describe('tree_to_graph: containers and wrappers', () => {
  it('wires parallel children as peers of the parallel junction (C-deluxe)', () => {
    const tree = parse_fixture('nested_parallel.json');
    const { nodes } = tree_to_graph(tree);
    // C-deluxe: parallel is a junction; its children are lifted to be
    // peers of the parallel itself, not nested inside.
    const par_outer = find_by_id(nodes, 'seq:fanout/par:outer');
    expect(par_outer?.type).toBe('parallel');
    // Children of par:outer share the parallel's parent (the sequence).
    const peers = nodes.filter((n) => n.parentId === 'seq:fanout');
    const peer_ids = peers.map((n) => n.id);
    expect(peer_ids).toContain('seq:fanout/par:outer');
    expect(peer_ids).toContain('seq:fanout/par:outer/par:alpha');
    expect(peer_ids).toContain('seq:fanout/par:outer/step:beta');
  });

  it('drops the retry wrapper from the graph and emits a self-loop on the wrapped child', () => {
    const tree = parse_fixture('full_primitive_set.json');
    const { nodes, edges } = tree_to_graph(tree);
    // Retry wrapper itself is no longer emitted as a node (B-deluxe).
    expect(find_by_id(nodes, 'seq:everything/retry:flaky')).toBeUndefined();
    const retry_child = find_by_id(nodes, 'seq:everything/retry:flaky/step:flaky');
    // The wrapped child sits as a peer of the retry's parent (sequence).
    expect(retry_child?.parentId).toBe('seq:everything');
    // A self-loop edge attaches to the child carrying retry's config.
    const self_loops = edges.filter(
      (e) => e.data?.kind === 'self-loop' && e.source === 'seq:everything/retry:flaky/step:flaky',
    );
    expect(self_loops.length).toBe(1);
  });

  it('attaches a pipe wrapper as an after-position badge on the lifted child', () => {
    const tree = parse_fixture('full_primitive_set.json');
    const { nodes, edges } = tree_to_graph(tree);
    // The pipe wrapper itself is no longer emitted as a separate node —
    // markers are now inline corner badges on the wrapped step.
    const pipe_node = find_by_id(nodes, 'seq:everything/scope:root/pipe:upper');
    expect(pipe_node).toBeUndefined();
    const pipe_child = find_by_id(
      nodes,
      'seq:everything/scope:root/pipe:upper/use:greeting',
    );
    // Lift: the wrapped child's parentId is the wrapper's parent (the scope).
    expect(pipe_child?.parentId).toBe('seq:everything/scope:root');
    // Wrapper info lands on the child as a badge.
    const badges = pipe_child?.data.wrappers ?? [];
    const pipe_badge = badges.find((b) => b.kind === 'pipe');
    expect(pipe_badge).toBeDefined();
    expect(pipe_badge?.position).toBe('after');
    expect(typeof pipe_badge?.label).toBe('string');
    // No standalone decoration edge — the badge replaces it.
    const pipe_fn_edges = edges.filter((e) => e.data?.kind === 'pipe-fn');
    expect(pipe_fn_edges.length).toBe(0);
  });
});

describe('tree_to_graph: parallel fan-out', () => {
  it('emits one labeled edge per child from the container input', () => {
    const tree = parse_fixture('parallel_ordering.json');
    const { edges } = tree_to_graph(tree);

    const fan_out = edges
      .filter((e) => e.source === 'par:ordered' && e.data?.kind === 'structural')
      .map((e) => ({ target: e.target, label: e.label }));

    expect(fan_out).toEqual([
      { target: 'par:ordered/step:first', label: 'first' },
      { target: 'par:ordered/step:second', label: 'second' },
      { target: 'par:ordered/step:third', label: 'third' },
      { target: 'par:ordered/step:fourth', label: 'fourth' },
    ]);
  });
});

describe('tree_to_graph: scope stash → use overlay', () => {
  it('emits a dashed overlay edge from each stash to every matching use in scope', () => {
    const tree = parse_fixture('full_primitive_set.json');
    const { edges } = tree_to_graph(tree);

    const overlays = edges.filter((e) => e.data?.kind === 'overlay');
    expect(overlays.length).toBe(1);
    const overlay = overlays[0];
    expect(overlay?.source).toBe('seq:everything/scope:root/stash:greeting');
    expect(overlay?.target).toBe(
      'seq:everything/scope:root/pipe:upper/use:greeting',
    );
    expect(overlay?.label).toBe('greeting');
  });
});

describe('tree_to_graph: cycle handling', () => {
  it('renders a <cycle> sentinel as a dedicated cycle node referencing the target id', () => {
    const tree = parse_fixture('cycle_bug.json');
    const { nodes } = tree_to_graph(tree);
    const cycle = nodes.find((n) => n.type === 'cycle');
    expect(cycle).toBeDefined();
    expect(cycle?.data.kind).toBe('<cycle>');
    expect(cycle?.data.cycle_target).toBe('seq:loop');
  });

  it('does not infinite-recurse if a true reference cycle slips past validation', () => {
    const inner: { kind: string; id: string; children: unknown[] } = {
      kind: 'sequence',
      id: 'cycle:inner',
      children: [],
    };
    inner.children.push(inner);
    const tree = {
      version: 1 as const,
      root: { kind: 'sequence', id: 'cycle:outer', children: [inner] },
    } as unknown as FlowTree;

    const { nodes } = tree_to_graph(tree);
    const guarded = nodes.find((n) => n.data.warning === 'cycle-guard');
    expect(guarded).toBeDefined();
  });
});

describe('tree_to_graph: unknown kinds', () => {
  it('renders unknown kinds via the generic fallback and still recurses into their children', () => {
    const tree: FlowTree = {
      version: 1,
      root: {
        kind: 'sequence',
        id: 'root',
        children: [
          {
            kind: 'fancy_new_kind',
            id: 'unknown:1',
            children: [{ kind: 'step', id: 'inner' }],
          },
        ],
      },
    };

    const { nodes } = tree_to_graph(tree);
    const unknown_node = find_by_id(nodes, 'root/unknown:1');
    expect(unknown_node?.type).toBe('generic');
    expect(unknown_node?.data.generic).toBe(true);

    const child = find_by_id(nodes, 'root/unknown:1/inner');
    expect(child).toBeDefined();
    expect(child?.parentId).toBe('root/unknown:1');
  });
});

function child_order(g: { nodes: ReadonlyArray<WeftNode>; edges: ReadonlyArray<WeftEdge> }) {
  // C-deluxe: parallel is a junction with children lifted to peers.
  // The "parallel children" the ordering test cares about are now nodes
  // whose graph_id is path-prefixed by 'par:ordered/' but whose
  // parentId is the parallel's parent (or unset at root). Filter on
  // path prefix to capture them.
  const children = g.nodes
    .filter((n) => n.id.startsWith('par:ordered/') && !n.id.slice('par:ordered/'.length).includes('/'))
    .map((n) => n.id);
  const fan_out = g.edges
    .filter((e) => e.source === 'par:ordered' && e.data?.kind === 'structural')
    .map((e) => `${e.target}|${typeof e.label === 'string' ? e.label : ''}`);
  return { children, fan_out };
}

describe('tree_to_graph: parallel ordering regression', () => {
  it('emits children and edges in declaration order across re-runs after a config tweak', () => {
    const tree = parse_fixture('parallel_ordering.json');

    const before = child_order(tree_to_graph(tree));

    const tweaked: FlowTree = {
      ...tree,
      root: {
        ...tree.root,
        config: { ...tree.root.config, marker: 'tweak' },
      },
    };
    const after = child_order(tree_to_graph(tweaked));

    expect(before.children).toEqual([
      'par:ordered/step:first',
      'par:ordered/step:second',
      'par:ordered/step:third',
      'par:ordered/step:fourth',
    ]);
    expect(before).toEqual(after);
  });
});

describe('tree_to_graph: input is not mutated', () => {
  it('leaves the input deep-equal to a pre-call clone', () => {
    const fixture = load_fixture_raw('full_primitive_set.json');
    const before = JSON.parse(JSON.stringify(fixture)) as unknown;
    const tree = flow_tree_schema.parse(fixture);
    tree_to_graph(tree);
    expect(JSON.parse(JSON.stringify(fixture))).toEqual(before);
  });
});

describe('tree_to_graph: edges carry a typed kind', () => {
  it('tags every edge in full_primitive_set.json with a known kind', () => {
    const tree = parse_fixture('full_primitive_set.json');
    const { edges } = tree_to_graph(tree);
    const known = new Set([
      'structural',
      'overlay',
      'self-loop',
      'loop-back',
      'pipe-fn',
      'timeout-deadline',
      'checkpoint-key',
      'map-cardinality',
    ]);
    for (const edge of edges) {
      expect(known.has(edge.data?.kind ?? '')).toBe(true);
    }
  });
});

describe('tree_to_graph: new primitive kinds', () => {
  it('renders branch as a labeled-edge container with then/otherwise', () => {
    const tree: FlowTree = {
      version: 1,
      root: {
        kind: 'branch',
        id: 'branch_1',
        children: [
          { kind: 'step', id: 'step:then' },
          { kind: 'step', id: 'step:otherwise' },
        ],
      },
    };
    const { nodes, edges } = tree_to_graph(tree);
    expect(find_by_id(nodes, 'branch_1')?.type).toBe('branch');
    const labeled = edges
      .filter((e) => e.source === 'branch_1' && e.data?.kind === 'structural')
      .map((e) => `${e.target}|${typeof e.label === 'string' ? e.label : ''}`);
    expect(labeled).toEqual([
      'branch_1/step:then|then',
      'branch_1/step:otherwise|otherwise',
    ]);
  });

  it('renders fallback as a labeled-edge container with primary/backup', () => {
    const tree: FlowTree = {
      version: 1,
      root: {
        kind: 'fallback',
        id: 'fallback_1',
        children: [
          { kind: 'step', id: 'step:primary' },
          { kind: 'step', id: 'step:backup' },
        ],
      },
    };
    const { nodes, edges } = tree_to_graph(tree);
    expect(find_by_id(nodes, 'fallback_1')?.type).toBe('fallback');
    const labeled = edges
      .filter((e) => e.source === 'fallback_1' && e.data?.kind === 'structural')
      .map((e) => `${e.target}|${typeof e.label === 'string' ? e.label : ''}`);
    expect(labeled).toEqual([
      'fallback_1/step:primary|primary',
      'fallback_1/step:backup|backup',
    ]);
  });

  it('drops the loop wrapper from the graph and emits a loop-back edge on the wrapped child', () => {
    const tree: FlowTree = {
      version: 1,
      root: {
        kind: 'loop',
        id: 'loop_1',
        config: { max_rounds: 5 },
        children: [{ kind: 'step', id: 'inner' }],
      },
    };
    const { nodes, edges } = tree_to_graph(tree);
    // Loop wrapper is not emitted as a node (B-deluxe).
    expect(find_by_id(nodes, 'loop_1')).toBeUndefined();
    const child = find_by_id(nodes, 'loop_1/inner');
    expect(child).toBeDefined();
    // The child is at the root level — its parentId is undefined (no parent).
    expect(child?.parentId).toBeUndefined();
    // A loop-back edge attaches to the child carrying the loop's config.
    const loop_backs = edges.filter((e) => e.data?.kind === 'loop-back');
    expect(loop_backs.length).toBe(1);
    expect(loop_backs[0]?.source).toBe('loop_1/inner');
  });

  it('attaches timeout/checkpoint/map wrappers as inline badges on the lifted child', () => {
    const cases: Array<{
      kind: 'timeout' | 'checkpoint' | 'map';
      old_edge_kind: 'timeout-deadline' | 'checkpoint-key' | 'map-cardinality';
      position: 'after' | 'before';
    }> = [
      { kind: 'timeout', old_edge_kind: 'timeout-deadline', position: 'after' },
      { kind: 'checkpoint', old_edge_kind: 'checkpoint-key', position: 'before' },
      { kind: 'map', old_edge_kind: 'map-cardinality', position: 'before' },
    ];
    for (const { kind, old_edge_kind, position } of cases) {
      const tree: FlowTree = {
        version: 1,
        root: {
          kind,
          id: `${kind}_1`,
          children: [{ kind: 'step', id: 'inner' }],
        },
      };
      const { nodes, edges } = tree_to_graph(tree);
      // Wrapper itself no longer exists as a standalone node.
      expect(find_by_id(nodes, `${kind}_1`)).toBeUndefined();
      const child = find_by_id(nodes, `${kind}_1/inner`);
      expect(child?.parentId).toBeUndefined();
      // Wrapper info attached as an inline badge on the child.
      const badges = child?.data.wrappers ?? [];
      const badge = badges.find((b) => b.kind === kind);
      expect(badge).toBeDefined();
      expect(badge?.position).toBe(position);
      // The old decoration edge between marker and child is gone.
      expect(edges.filter((e) => e.data?.kind === old_edge_kind).length).toBe(0);
    }
  });

  it('renders compose collapsed by default, omitting its inner subgraph', () => {
    const tree: FlowTree = {
      version: 1,
      root: {
        kind: 'compose',
        id: 'compose_1',
        children: [{ kind: 'step', id: 'inner' }],
      },
    };
    const { nodes } = tree_to_graph(tree);
    expect(find_by_id(nodes, 'compose_1')?.type).toBe('compose');
    expect(find_by_id(nodes, 'compose_1')?.data.is_expanded).toBe(false);
    expect(find_by_id(nodes, 'compose_1/inner')).toBeUndefined();
  });

  it('renders compose expanded when its graph id is passed in expanded_composes', () => {
    const tree: FlowTree = {
      version: 1,
      root: {
        kind: 'compose',
        id: 'compose_1',
        children: [{ kind: 'step', id: 'inner' }],
      },
    };
    const { nodes } = tree_to_graph(tree, {
      expanded_composes: new Set(['compose_1']),
    });
    const wrapper = find_by_id(nodes, 'compose_1');
    const child = find_by_id(nodes, 'compose_1/inner');
    expect(wrapper?.data.is_expanded).toBe(true);
    expect(child?.parentId).toBe('compose_1');
  });

  it('renders suspend as a leaf with no children', () => {
    const tree: FlowTree = {
      version: 1,
      root: {
        kind: 'suspend',
        id: 'approval_gate',
        config: { id: 'approval_gate' },
      },
    };
    const { nodes } = tree_to_graph(tree);
    const node = find_by_id(nodes, 'approval_gate');
    expect(node?.type).toBe('suspend');
    expect(nodes.length).toBe(1);
  });

  it('preserves meta on the WeftNode data', () => {
    const tree: FlowTree = {
      version: 1,
      root: {
        kind: 'step',
        id: 'fetch',
        meta: {
          display_name: 'fetch user',
          description: 'reads from the user repo',
          port_labels: { in: 'user_id', out: 'user' },
        },
      },
    };
    const { nodes } = tree_to_graph(tree);
    expect(nodes[0]?.data.meta?.display_name).toBe('fetch user');
    expect(nodes[0]?.data.meta?.port_labels?.out).toBe('user');
  });

  it('renders the all_primitives.json fixture without unknown kinds', () => {
    const tree = parse_fixture('all_primitives.json');
    const { nodes } = tree_to_graph(tree);
    for (const node of nodes) {
      expect(node.data.generic).not.toBe(true);
    }
  });
});

describe('tree_to_graph: function and schema reference rendering', () => {
  it('passes function and schema references through on data.config for downstream rendering', () => {
    const tree: FlowTree = {
      version: 1,
      root: {
        kind: 'step',
        id: 'step:1',
        config: {
          fn_named: { kind: '<fn>', name: 'do_thing' },
          fn_anon: { kind: '<fn>' },
          schema: { kind: '<schema>' },
        },
      },
    };
    const { nodes } = tree_to_graph(tree);
    const root = nodes[0];
    expect(root?.data.config).toEqual({
      fn_named: { kind: '<fn>', name: 'do_thing' },
      fn_anon: { kind: '<fn>' },
      schema: { kind: '<schema>' },
    });
  });
});
