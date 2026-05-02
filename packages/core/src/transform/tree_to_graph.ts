/**
 * Pure tree-to-graph transform.
 *
 * Walks a validated `FlowTree` depth-first and emits the React Flow node and
 * edge arrays needed by the canvas. Layout positions are placeholders
 * (`{ x: 0, y: 0 }`); the layout pipeline (phase 3) supplies real coordinates.
 *
 * Rules (see spec.md §5.1):
 *   - Every graph node id is parent-prefixed: `<parent_path>/<node.id>`.
 *   - The flat `nodes` array is sorted depth-first so parents always precede
 *     children. Workaround for xyflow Discussion #4830 (research F15).
 *   - Containers (`sequence`, `parallel`, `scope`, `branch`, `fallback`) link
 *     children via `parentId`. Wrappers (`pipe`, `retry`, `timeout`,
 *     `checkpoint`, `compose`, `map`, `loop`) link their child(ren) the same
 *     way.
 *   - `sequence` emits one edge per adjacent child pair.
 *   - `parallel` emits one edge per child, labeled with `config.keys[i]`.
 *   - `branch` emits one edge per child labeled `then` / `otherwise`.
 *   - `fallback` emits one edge per child labeled `primary` / `backup`.
 *   - `scope` emits dashed overlay edges from each `stash` to every downstream
 *     `use` whose `config.keys` contains that stash key.
 *   - `<cycle>` sentinel renders as a dedicated cycle node, its `id` field
 *     naming the upstream node it points back to.
 *   - Unknown kinds render through the generic-fallback component; children
 *     still recurse.
 *
 * The transform never mutates its input (constraints §5.7).
 */

import type { Edge, Node } from '@xyflow/react';

import type { FlowNode, FlowTree, FlowValue, StepMetadata } from '../schemas.js';
import type { NodeRuntimeState } from '../runtime_state.js';

export type WeftNodeData = {
  kind: string;
  id: string;
  config?: FlowNode['config'];
  meta?: StepMetadata;
  cycle_target?: string;
  generic?: true;
  warning?: 'cycle-guard';
  runtime?: NodeRuntimeState;
};

export type WeftEdgeData = {
  kind: 'structural' | 'overlay' | 'self-loop' | 'loop-back';
  /**
   * For wrapper-derived edges (`self-loop`, `loop-back`), the wrapper's
   * graph id so the edge click handler can route the inspector to the
   * wrapper's flow-tree node. Structural/overlay edges leave this absent.
   */
  wrapper_id?: string;
  /**
   * Condensed label for wrapper edges, e.g. "↻ 3× / 250ms" for retry.
   * Renderers use this verbatim; transform formats it once at emit time so
   * edge components stay free of config-parsing logic.
   */
  wrapper_label?: string;
  /**
   * Semantic role for branch/fallback labeled edges. Surfaces in CSS so
   * `otherwise`/`backup` edges can render dashed (the "alt path" subway
   * convention) while `then`/`primary` stay solid. Absent on structural
   * edges that have no semantic role.
   */
  role?: 'then' | 'otherwise' | 'primary' | 'backup';
};

export type WeftNode = Node<WeftNodeData>;
export type WeftEdge = Edge<WeftEdgeData>;

export type TreeToGraphResult = {
  nodes: WeftNode[];
  edges: WeftEdge[];
};

const KNOWN_KINDS = new Set([
  'step',
  'sequence',
  'parallel',
  'branch',
  'map',
  'pipe',
  'retry',
  'fallback',
  'timeout',
  'loop',
  'compose',
  'checkpoint',
  'suspend',
  'scope',
  'stash',
  'use',
]);

const CONTAINER_KINDS = new Set(['sequence', 'parallel', 'scope', 'branch', 'fallback']);
const WRAPPER_KINDS = new Set([
  'pipe',
  'retry',
  'timeout',
  'checkpoint',
  'compose',
  'map',
  'loop',
]);
const CYCLE_KIND = '<cycle>';
const GENERIC_TYPE = 'generic';
const CYCLE_TYPE = 'cycle';

function node_type_for(kind: string): string {
  if (kind === CYCLE_KIND) return CYCLE_TYPE;
  if (KNOWN_KINDS.has(kind)) return kind;
  return GENERIC_TYPE;
}

function child_path(parent_path: string, child_id: string): string {
  return `${parent_path}/${child_id}`;
}

function read_string(value: FlowValue | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function read_string_array(value: FlowValue | undefined): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') return undefined;
    out.push(entry);
  }
  return out;
}

type StashRecord = {
  key: string;
  graph_id: string;
};

type WalkContext = {
  nodes: WeftNode[];
  edges: WeftEdge[];
  visited: WeakSet<FlowNode>;
};

function build_node_data(node: FlowNode): WeftNodeData {
  const data: WeftNodeData = { kind: node.kind, id: node.id };
  if (node.config !== undefined) data.config = node.config;
  if (node.meta !== undefined) data.meta = node.meta;
  return data;
}

function emit_warning_node(
  ctx: WalkContext,
  node: FlowNode,
  graph_id: string,
  parent_id: string | null,
): void {
  const data: WeftNodeData = {
    kind: node.kind,
    id: node.id,
    warning: 'cycle-guard',
  };
  if (node.config !== undefined) data.config = node.config;
  const rf_node: WeftNode = {
    id: graph_id,
    type: GENERIC_TYPE,
    position: { x: 0, y: 0 },
    data,
  };
  if (parent_id !== null) rf_node.parentId = parent_id;
  ctx.nodes.push(rf_node);
}

type BranchRole = NonNullable<WeftEdgeData['role']>;

function role_for_label(label: string | undefined): BranchRole | undefined {
  if (label === 'then' || label === 'otherwise') return label;
  if (label === 'primary' || label === 'backup') return label;
  return undefined;
}

function structural_edge(
  source: string,
  target: string,
  label?: string,
  source_handle?: string,
): WeftEdge {
  const id = label === undefined
    ? `e:${source}->${target}`
    : `e:${source}->${target}:${label}`;
  const role = role_for_label(label);
  const data: WeftEdgeData = role === undefined
    ? { kind: 'structural' }
    : { kind: 'structural', role };
  const edge: WeftEdge = { id, source, target, data };
  if (label !== undefined) edge.label = label;
  if (source_handle !== undefined) edge.sourceHandle = source_handle;
  if (role !== undefined) edge.className = `weft-edge-role-${role}`;
  return edge;
}

function overlay_edge(source: string, target: string, label: string): WeftEdge {
  return {
    id: `e:overlay:${source}->${target}:${label}`,
    source,
    target,
    label,
    data: { kind: 'overlay' },
  };
}

function emit_cycle_node(
  ctx: WalkContext,
  node: FlowNode,
  graph_id: string,
  parent_id: string | null,
): void {
  const data: WeftNodeData = {
    kind: node.kind,
    id: node.id,
    cycle_target: node.id,
  };
  if (node.config !== undefined) data.config = node.config;
  const rf_node: WeftNode = {
    id: graph_id,
    type: CYCLE_TYPE,
    position: { x: 0, y: 0 },
    data,
  };
  if (parent_id !== null) rf_node.parentId = parent_id;
  ctx.nodes.push(rf_node);
}

function emit_basic_node(
  ctx: WalkContext,
  node: FlowNode,
  graph_id: string,
  parent_id: string | null,
): void {
  const type_ = node_type_for(node.kind);
  const data = build_node_data(node);
  if (type_ === GENERIC_TYPE) data.generic = true;
  const rf_node: WeftNode = {
    id: graph_id,
    type: type_,
    position: { x: 0, y: 0 },
    data,
  };
  if (parent_id !== null) rf_node.parentId = parent_id;
  ctx.nodes.push(rf_node);
}

type UseRecord = {
  keys: ReadonlyArray<string>;
  graph_id: string;
};

function collect_scope_bindings(
  node: FlowNode,
  graph_id: string,
  stashes: StashRecord[],
  uses: UseRecord[],
): void {
  if (node.kind === 'stash') {
    const key = read_string(node.config?.['key']);
    if (key !== undefined) stashes.push({ key, graph_id });
  } else if (node.kind === 'use') {
    const keys = read_string_array(node.config?.['keys']);
    if (keys !== undefined) uses.push({ keys, graph_id });
  }
  const children = node.children;
  if (children === undefined) return;
  for (const child of children) {
    collect_scope_bindings(child, child_path(graph_id, child.id), stashes, uses);
  }
}

function walk_scope_children(
  ctx: WalkContext,
  scope_node: FlowNode,
  scope_graph_id: string,
): void {
  const children = scope_node.children ?? [];
  for (const child of children) {
    walk(ctx, child, scope_graph_id, scope_graph_id);
  }
  const stashes: StashRecord[] = [];
  const uses: UseRecord[] = [];
  for (const child of children) {
    collect_scope_bindings(child, child_path(scope_graph_id, child.id), stashes, uses);
  }
  for (const use of uses) {
    for (const requested of use.keys) {
      for (const stash of stashes) {
        if (stash.key !== requested) continue;
        ctx.edges.push(overlay_edge(stash.graph_id, use.graph_id, requested));
      }
    }
  }
}

function walk_sequence_children(
  ctx: WalkContext,
  parent_node: FlowNode,
  parent_graph_id: string,
): void {
  const children = parent_node.children ?? [];
  const child_graph_ids: string[] = [];
  for (const child of children) {
    const child_graph_id = child_path(parent_graph_id, child.id);
    child_graph_ids.push(child_graph_id);
    walk(ctx, child, parent_graph_id, parent_graph_id);
  }
  for (let i = 0; i < child_graph_ids.length - 1; i += 1) {
    const source = child_graph_ids[i];
    const target = child_graph_ids[i + 1];
    if (source === undefined || target === undefined) continue;
    ctx.edges.push(structural_edge(source, target));
  }
}

function walk_parallel_children(
  ctx: WalkContext,
  parent_node: FlowNode,
  parent_graph_id: string,
): void {
  const children = parent_node.children ?? [];
  const keys = read_string_array(parent_node.config?.['keys']) ?? [];
  for (let i = 0; i < children.length; i += 1) {
    const child = children[i];
    if (child === undefined) continue;
    const child_graph_id = child_path(parent_graph_id, child.id);
    walk(ctx, child, parent_graph_id, parent_graph_id);
    const label = keys[i];
    const source_handle = label === undefined ? undefined : `out:${label}`;
    ctx.edges.push(structural_edge(parent_graph_id, child_graph_id, label, source_handle));
  }
}

function walk_labeled_children(
  ctx: WalkContext,
  parent_node: FlowNode,
  parent_graph_id: string,
  labels: ReadonlyArray<string>,
): void {
  const children = parent_node.children ?? [];
  for (let i = 0; i < children.length; i += 1) {
    const child = children[i];
    if (child === undefined) continue;
    const child_graph_id = child_path(parent_graph_id, child.id);
    walk(ctx, child, parent_graph_id, parent_graph_id);
    const label = labels[i];
    const source_handle = label === undefined ? undefined : `out:${label}`;
    ctx.edges.push(structural_edge(parent_graph_id, child_graph_id, label, source_handle));
  }
}

function format_retry_label(config: FlowNode['config']): string {
  const attempts = read_number(config?.['max_attempts']);
  const backoff = read_number(config?.['backoff_ms']);
  if (attempts !== undefined && backoff !== undefined) {
    return `↻ ${String(attempts)}× / ${String(backoff)}ms`;
  }
  if (attempts !== undefined) return `↻ ${String(attempts)}×`;
  if (backoff !== undefined) return `↻ ${String(backoff)}ms`;
  return '↻ retry';
}

function format_loop_label(config: FlowNode['config']): string {
  const max_rounds = read_number(config?.['max_rounds']);
  if (max_rounds !== undefined) return `↺ ≤ ${String(max_rounds)}`;
  return '↺ loop';
}

function read_number(value: FlowValue | undefined): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function self_loop_edge(node_id: string, label: string, wrapper_id: string): WeftEdge {
  return {
    id: `e:self-loop:${wrapper_id}->${node_id}`,
    type: 'self-loop',
    source: node_id,
    target: node_id,
    label,
    data: { kind: 'self-loop', wrapper_id, wrapper_label: label },
  };
}

function loop_back_edge(node_id: string, label: string, wrapper_id: string): WeftEdge {
  return {
    id: `e:loop-back:${wrapper_id}->${node_id}`,
    type: 'loop-back',
    source: node_id,
    target: node_id,
    label,
    data: { kind: 'loop-back', wrapper_id, wrapper_label: label },
  };
}

/**
 * Walk a wrapper's child subtree, then attach a wrapper-specific decoration
 * edge to the wrapped child. The wrapper itself remains in the graph as a
 * container (so it stays clickable for the inspector and runtime overlay
 * cascade); the decoration edge is what surfaces the wrapper's signature
 * topology — retry's self-loop, loop's back-edge — visually.
 */
function walk_wrapper_child(
  ctx: WalkContext,
  parent_node: FlowNode,
  parent_graph_id: string,
): void {
  const children = parent_node.children ?? [];
  for (const child of children) {
    walk(ctx, child, parent_graph_id, parent_graph_id);
  }
  if (children.length === 0) return;
  // The wrapped child is the first (and for retry/loop typically the only)
  // child; the decoration edge lands on it. Loop's optional guard child is
  // a second sibling — it does not need its own back-edge.
  const first_child = children[0];
  if (first_child === undefined) return;
  const child_graph_id = child_path(parent_graph_id, first_child.id);
  if (parent_node.kind === 'retry') {
    const label = format_retry_label(parent_node.config);
    ctx.edges.push(self_loop_edge(child_graph_id, label, parent_graph_id));
    return;
  }
  if (parent_node.kind === 'loop') {
    const label = format_loop_label(parent_node.config);
    ctx.edges.push(loop_back_edge(child_graph_id, label, parent_graph_id));
    return;
  }
}

function walk(
  ctx: WalkContext,
  node: FlowNode,
  parent_graph_id: string | null,
  parent_path_str: string | null,
): void {
  const graph_id = parent_path_str === null
    ? node.id
    : child_path(parent_path_str, node.id);

  if (node.kind === CYCLE_KIND) {
    emit_cycle_node(ctx, node, graph_id, parent_graph_id);
    return;
  }

  if (ctx.visited.has(node)) {
    emit_warning_node(ctx, node, graph_id, parent_graph_id);
    return;
  }
  ctx.visited.add(node);

  emit_basic_node(ctx, node, graph_id, parent_graph_id);

  if (CONTAINER_KINDS.has(node.kind)) {
    if (node.kind === 'sequence') {
      walk_sequence_children(ctx, node, graph_id);
      return;
    }
    if (node.kind === 'parallel') {
      walk_parallel_children(ctx, node, graph_id);
      return;
    }
    if (node.kind === 'scope') {
      walk_scope_children(ctx, node, graph_id);
      return;
    }
    if (node.kind === 'branch') {
      walk_labeled_children(ctx, node, graph_id, ['then', 'otherwise']);
      return;
    }
    if (node.kind === 'fallback') {
      walk_labeled_children(ctx, node, graph_id, ['primary', 'backup']);
      return;
    }
  }

  if (WRAPPER_KINDS.has(node.kind)) {
    walk_wrapper_child(ctx, node, graph_id);
    return;
  }

  const children = node.children;
  if (children === undefined || children.length === 0) return;
  for (const child of children) {
    walk(ctx, child, graph_id, graph_id);
  }
}

export function tree_to_graph(tree: FlowTree): TreeToGraphResult {
  const ctx: WalkContext = {
    nodes: [],
    edges: [],
    visited: new WeakSet(),
  };
  walk(ctx, tree.root, null, null);
  return { nodes: ctx.nodes, edges: ctx.edges };
}
