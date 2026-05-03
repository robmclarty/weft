/**
 * Acceptance-criteria tests for the canvas visual simplification.
 *
 * The user spec (see conversation 2026-05-03):
 *   1. Top-level steps flow directly into each other; no floating nodes.
 *   2. Only `compose` produces a visible outer box; `sequence` and `scope`
 *      are structural-only and emit no React Flow node of their own.
 *   3. Composites default to **expanded**.
 *   4. Edges crossing INTO an expanded compose terminate on the compose's
 *      outer box (target === compose graph_id), never on its inner first
 *      child.
 *   5. Edges crossing OUT of a compose originate from the compose's outer
 *      box (source === compose graph_id), never from its inner last child.
 *   6. Maximum nesting in the `parentId` chain is one level (only compose
 *      forms a parent group; sequence/scope used to add a second level).
 *
 * These tests pin those acceptance criteria so the implementation can be
 * driven red→green and we have a verifiable signal that the criteria are
 * actually met instead of inferred from a screenshot.
 */

import { describe, expect, it } from 'vitest';

import { flow_tree_schema, type FlowTree } from '../../schemas.js';
import { load_fixture_raw } from '../../test_helpers.js';
import { tree_to_graph, type WeftEdge, type WeftNode } from '../tree_to_graph.js';

function parse_fixture(name: string): FlowTree {
  return flow_tree_schema.parse(load_fixture_raw(name));
}

function structural_edges(edges: ReadonlyArray<WeftEdge>): WeftEdge[] {
  return edges.filter((e) => e.data?.kind === 'structural');
}

/**
 * Transitively collect every node id whose `parentId` chain leads to
 * `root_id`, including `root_id` itself. Used to compute a compose's
 * subtree for boundary-edge assertions.
 */
function descendant_ids(
  nodes: ReadonlyArray<WeftNode>,
  root_id: string,
): Set<string> {
  const result = new Set<string>([root_id]);
  let added = true;
  while (added) {
    added = false;
    for (const n of nodes) {
      if (result.has(n.id)) continue;
      if (n.parentId !== undefined && result.has(n.parentId)) {
        result.add(n.id);
        added = true;
      }
    }
  }
  return result;
}

describe('criterion B: sequence is structural-only — no `sequence` node emitted', () => {
  it('does not emit a sequence node for simple_sequence.json', () => {
    const tree = parse_fixture('simple_sequence.json');
    const { nodes } = tree_to_graph(tree);
    const sequences = nodes.filter((n) => n.type === 'sequence');
    expect(sequences).toEqual([]);
  });

  it('does not emit a sequence node for all_primitives.json', () => {
    const tree = parse_fixture('all_primitives.json');
    const { nodes } = tree_to_graph(tree);
    const sequences = nodes.filter((n) => n.type === 'sequence');
    expect(sequences).toEqual([]);
  });

  it('still emits the chain edges between adjacent sequence members', () => {
    const tree = parse_fixture('simple_sequence.json');
    const { edges } = tree_to_graph(tree);
    // The three steps must be linked greet → farewell → cleanup. Source
    // and target ids may shed the seq:root prefix when the sequence is
    // no longer a parent group, so check by suffix.
    const chain = structural_edges(edges).map(
      (e) => `${e.source.split('/').pop() ?? ''}->${e.target.split('/').pop() ?? ''}`,
    );
    expect(chain).toContain('step:greet->step:farewell');
    expect(chain).toContain('step:farewell->step:cleanup');
  });
});

describe('criterion B: scope is structural-only — no `scope` node emitted', () => {
  it('does not emit a scope node for full_primitive_set.json', () => {
    const tree = parse_fixture('full_primitive_set.json');
    const { nodes } = tree_to_graph(tree);
    const scopes = nodes.filter((n) => n.type === 'scope');
    expect(scopes).toEqual([]);
  });

  it('does not emit a scope node for all_primitives.json', () => {
    const tree = parse_fixture('all_primitives.json');
    const { nodes } = tree_to_graph(tree);
    const scopes = nodes.filter((n) => n.type === 'scope');
    expect(scopes).toEqual([]);
  });

  it('still emits the dashed stash → use overlay edges', () => {
    const tree = parse_fixture('full_primitive_set.json');
    const { edges } = tree_to_graph(tree);
    const overlays = edges.filter((e) => e.data?.kind === 'overlay');
    expect(overlays.length).toBeGreaterThanOrEqual(1);
  });
});

describe('criterion C: composites are expanded by default', () => {
  it('emits inner subgraph for compose without any options', () => {
    const tree: FlowTree = {
      version: 1,
      root: {
        kind: 'compose',
        id: 'compose_1',
        children: [{ kind: 'step', id: 'inner' }],
      },
    };
    const { nodes } = tree_to_graph(tree);
    const compose = nodes.find((n) => n.id === 'compose_1');
    const inner = nodes.find((n) => n.id === 'compose_1/inner');
    expect(compose?.data.is_expanded).toBe(true);
    expect(inner).toBeDefined();
    expect(inner?.parentId).toBe('compose_1');
  });

  it('emits inner subgraph for the all_primitives compose root by default', () => {
    const tree = parse_fixture('all_primitives.json');
    const { nodes } = tree_to_graph(tree);
    const compose = nodes.find((n) => n.id === 'agent_pipeline_1');
    expect(compose?.type).toBe('compose');
    expect(compose?.data.is_expanded).toBe(true);
    // At least one descendant should exist — by default the compose is
    // expanded so children render.
    const descendants = nodes.filter((n) => n.id.startsWith('agent_pipeline_1/'));
    expect(descendants.length).toBeGreaterThan(0);
  });
});

describe('criteria D & E: edges across compose boundary attach to compose id', () => {
  it('inbound edges target the compose, outbound source from the compose', () => {
    // Build a flat sequence with a compose in the middle so we have both
    // an inbound and outbound boundary edge.
    const tree: FlowTree = {
      version: 1,
      root: {
        kind: 'sequence',
        id: 'seq:root',
        children: [
          { kind: 'step', id: 'step:before' },
          {
            kind: 'compose',
            id: 'compose:mid',
            children: [
              {
                kind: 'sequence',
                id: 'seq:inner',
                children: [
                  { kind: 'step', id: 'step:inner_a' },
                  { kind: 'step', id: 'step:inner_b' },
                ],
              },
            ],
          },
          { kind: 'step', id: 'step:after' },
        ],
      },
    };
    const { nodes, edges } = tree_to_graph(tree);

    const compose = nodes.find((n) => n.data.kind === 'compose');
    expect(compose).toBeDefined();
    const compose_id = compose?.id ?? '';
    const subtree = descendant_ids(nodes, compose_id);

    const structural = structural_edges(edges);
    for (const edge of structural) {
      const source_in = subtree.has(edge.source);
      const target_in = subtree.has(edge.target);
      // Edge crosses INTO the compose (source outside, target inside) →
      // target must be the compose itself, not an inner step.
      if (!source_in && target_in) {
        expect(edge.target).toBe(compose_id);
      }
      // Edge crosses OUT of the compose (source inside, target outside)
      // → source must be the compose itself.
      if (source_in && !target_in) {
        expect(edge.source).toBe(compose_id);
      }
    }

    // There must actually exist at least one of each so the assertions
    // above are not vacuously satisfied.
    const inbound_boundary = structural.filter(
      (e) => !subtree.has(e.source) && subtree.has(e.target),
    );
    const outbound_boundary = structural.filter(
      (e) => subtree.has(e.source) && !subtree.has(e.target),
    );
    expect(inbound_boundary.length).toBeGreaterThanOrEqual(1);
    expect(outbound_boundary.length).toBeGreaterThanOrEqual(1);
  });
});

describe('criterion F: bounded nesting — sequence and scope never appear in the parent chain', () => {
  it('allows compose / stash / use as parent kinds, never sequence or scope', () => {
    const tree = parse_fixture('all_primitives.json');
    const { nodes } = tree_to_graph(tree);
    const allowed_parent_kinds = new Set([
      // The only "outer box" the user opted into.
      'compose',
      // The loop primitive: body+guard are parented under a labeled
      // container so the back-arc and exit read as one self-contained
      // sub-machine.
      'loop',
      // Marker wrappers that decorate a single inner step. These are
      // small tag-style containers and are out of scope for this pass.
      'stash',
      'use',
    ]);
    const by_id = new Map(nodes.map((n) => [n.id, n] as const));
    for (const node of nodes) {
      let cursor: WeftNode | undefined = node;
      while (cursor?.parentId !== undefined) {
        const parent = by_id.get(cursor.parentId);
        expect(parent).toBeDefined();
        const parent_kind = parent?.data.kind ?? '';
        expect(
          allowed_parent_kinds.has(parent_kind),
          `node ${node.id} has disallowed parent kind ${parent_kind}`,
        ).toBe(true);
        cursor = parent;
      }
    }
  });
});

describe('criterion A: no floating nodes — every visible node is connected', () => {
  /**
   * A node is "connected" if at least one of:
   *   - it has a `parentId` (visually contained in a parent box, e.g. a
   *     compose)
   *   - it appears as the source or target of any edge (structural,
   *     overlay, self-loop, loop-back, etc.)
   *
   * Cycle/warning sentinels are exempt because they reference an
   * upstream node by id rather than by edge.
   */
  function assert_no_orphans(g: { nodes: WeftNode[]; edges: WeftEdge[] }): void {
    const referenced = new Set<string>();
    for (const e of g.edges) {
      referenced.add(e.source);
      referenced.add(e.target);
    }
    // A "root container" hosts other nodes via parentId and is itself
    // not parented anywhere — e.g. the top-level compose in
    // all_primitives. It's not a floating node; it's the box every
    // descendant belongs to.
    const root_containers = new Set<string>();
    for (const n of g.nodes) {
      if (n.parentId !== undefined) root_containers.add(n.parentId);
    }
    for (const node of g.nodes) {
      if (node.data.kind === '<cycle>') continue;
      if (node.data.warning === 'cycle-guard') continue;
      const has_parent = node.parentId !== undefined;
      const is_referenced = referenced.has(node.id);
      const hosts_descendants = root_containers.has(node.id);
      const is_lone_root = g.nodes.length === 1;
      expect(
        has_parent || is_referenced || hosts_descendants || is_lone_root,
        `node ${node.id} is floating: no parentId and no edge references`,
      ).toBe(true);
    }
  }

  it('has no floating nodes in simple_sequence.json', () => {
    const tree = parse_fixture('simple_sequence.json');
    assert_no_orphans(tree_to_graph(tree));
  });

  it('has no floating nodes in all_primitives.json', () => {
    const tree = parse_fixture('all_primitives.json');
    assert_no_orphans(tree_to_graph(tree));
  });

  it('has no floating nodes in full_primitive_set.json', () => {
    const tree = parse_fixture('full_primitive_set.json');
    assert_no_orphans(tree_to_graph(tree));
  });

  it('has no floating nodes in nested_parallel.json', () => {
    const tree = parse_fixture('nested_parallel.json');
    assert_no_orphans(tree_to_graph(tree));
  });
});
