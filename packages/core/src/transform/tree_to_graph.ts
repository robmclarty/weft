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

export type WrapperBadge = {
  /**
   * The wrapper kind whose info this badge represents — `pipe`, `timeout`,
   * `checkpoint`, `map`, etc. The renderer looks up the kind's color and
   * glyph to keep the badge visually consistent with the kind's family
   * across the canvas.
   */
  kind: string;
  /**
   * Wrapper config formatted for display, e.g. `<fn:to_typescript>` for
   * pipe, `↻ 3× / 250ms` for retry, `8000ms` for timeout. Computed once
   * at emit time so renderers stay free of config-parsing logic.
   */
  label: string;
  /**
   * Position relative to the wrapped step. `'before'` means the wrapper
   * acts on the input (checkpoint loads, map fans out); `'after'` means
   * the wrapper acts on the output (pipe transforms, timeout deadlines).
   */
  position: 'before' | 'after';
};

export type WeftNodeData = {
  kind: string;
  id: string;
  config?: FlowNode['config'];
  meta?: StepMetadata;
  cycle_target?: string;
  generic?: true;
  warning?: 'cycle-guard';
  runtime?: NodeRuntimeState;
  /**
   * For `compose` nodes only: whether the user has expanded this composite
   * to reveal its inner subgraph. When `false`, the transform stops the
   * walk at this node, so the compose renders as a single labeled block;
   * when `true`, the inner children render as nested chrome (the v0 look).
   */
  is_expanded?: boolean;
  /**
   * Inline wrapper badges. Earlier iterations emitted a separate marker
   * node per wrapper (a 44×44 dot adjacent to the lifted step). The user
   * complaint that "lines float in space, not connecting black blocks"
   * was that the structural chain ran through those tiny markers, never
   * directly between the work steps. Now we attach wrapper info here and
   * let the leaf renderer paint a corner badge — the chain reads as
   * black-step → arrow → black-step, with each step labeling its own
   * wrappers in place.
   */
  wrappers?: ReadonlyArray<WrapperBadge>;
};

export type WeftEdgeData = {
  kind:
    | 'structural'
    | 'overlay'
    | 'self-loop'
    | 'loop-back'
    | 'pipe-fn'
    | 'timeout-deadline'
    | 'checkpoint-key'
    | 'map-cardinality';
  /**
   * For wrapper-derived edges (`self-loop`, `loop-back`, `pipe-fn`), the
   * wrapper's graph id so the edge click handler can route the inspector
   * to the wrapper's flow-tree node. Structural/overlay edges leave this
   * absent.
   */
  wrapper_id?: string;
  /**
   * Condensed label for wrapper edges, e.g. "↻ 3× / 250ms" for retry,
   * "<fn:to_upper>" for pipe. Renderers use this verbatim; transform
   * formats it once at emit time so edge components stay free of
   * config-parsing logic.
   */
  wrapper_label?: string;
  /**
   * Semantic role for branch/fallback labeled edges. Surfaces in CSS so
   * `otherwise`/`backup` edges can render dashed (the "alt path" subway
   * convention) while `then`/`primary` stay solid. Absent on structural
   * edges that have no semantic role.
   */
  role?: 'then' | 'otherwise' | 'primary' | 'backup';
  /**
   * ELK-computed orthogonal route in root (flow) space. Populated by
   * `apply_edge_routes` after layout; absent before. The custom orthogonal
   * edge component reads this to render the right-angle path ELK actually
   * computed instead of letting React Flow re-route from scratch.
   */
  waypoints?: ReadonlyArray<{ readonly x: number; readonly y: number }>;
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
  /**
   * Graph ids of `compose` nodes the user has expanded. A compose whose id
   * is absent renders as a collapsed leaf-style block; a compose whose id
   * is present recurses into its children. Defaults to empty so trees
   * load with all composites collapsed — the abstraction the user opted
   * into is what they see first.
   */
  expanded_composes: ReadonlySet<string>;
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
  if (node.kind === 'compose') {
    data.is_expanded = ctx.expanded_composes.has(graph_id);
  }
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
    // Use walk_for_chain so wrapper children inside the scope still get
    // lifted to peers; we don't chain the segments here because scope
    // doesn't emit sequential edges between members.
    walk_for_chain(ctx, child, scope_graph_id, scope_graph_id);
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

/**
 * Each child returns a chain segment when walked: `first` is the graph id
 * the predecessor's edge should target (the input port), `last` is the
 * graph id the successor's edge should originate from (the output port).
 * For most kinds these are the same id; for wrappers that splice a marker
 * around their child (pipe), they differ — `first` lands on the lifted
 * child, `last` on the trailing marker.
 */
type ChainSegment = {
  first: string;
  last: string;
};

function walk_sequence_children(
  ctx: WalkContext,
  parent_node: FlowNode,
  parent_graph_id: string,
): void {
  const children = parent_node.children ?? [];
  const segments: ChainSegment[] = [];
  for (const child of children) {
    segments.push(walk_for_chain(ctx, child, parent_graph_id, parent_graph_id));
  }
  for (let i = 0; i < segments.length - 1; i += 1) {
    const a = segments[i];
    const b = segments[i + 1];
    if (a === undefined || b === undefined) continue;
    ctx.edges.push(structural_edge(a.last, b.first));
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
  // Self-loop: source and target are the same right-out handle. The edge
  // component renders a tight arc returning to the same point; React Flow
  // gives identical sourceX/sourceY and targetX/targetY which is what the
  // arc math wants.
  return {
    id: `e:self-loop:${wrapper_id}->${node_id}`,
    type: 'self-loop',
    source: node_id,
    target: node_id,
    sourceHandle: 'out',
    targetHandle: 'out',
    label,
    data: { kind: 'self-loop', wrapper_id, wrapper_label: label },
  };
}

function loop_back_edge(node_id: string, label: string, wrapper_id: string): WeftEdge {
  // Loop-back self-edge: edge sweeps from right-out handle back around to
  // left-in handle of the same node. Distinct handle ids make React Flow
  // compute distinct sourceX and targetX so the arc has real horizontal
  // extent instead of collapsing to a single point. Used for guard-less
  // loops where the body itself is the only chain member.
  return {
    id: `e:loop-back:${wrapper_id}->${node_id}`,
    type: 'loop-back',
    source: node_id,
    target: node_id,
    sourceHandle: 'out',
    targetHandle: 'in',
    label,
    data: { kind: 'loop-back', wrapper_id, wrapper_label: label },
  };
}

function loop_back_edge_between(
  source_node: string,
  target_node: string,
  label: string,
  wrapper_id: string,
): WeftEdge {
  // Loop-back inter-node: arc from `source_node`'s right-out to
  // `target_node`'s left-in. Used when a loop has a guard child — the
  // sequential chain runs body → guard, then this edge sweeps back from
  // the guard to the body to express "if guard fails, repeat body". The
  // LoopBackEdge component already handles distinct source/target points;
  // it just needs different node ids in source/target.
  return {
    id: `e:loop-back:${wrapper_id}:${source_node}->${target_node}`,
    type: 'loop-back',
    source: source_node,
    target: target_node,
    sourceHandle: 'out',
    targetHandle: 'in',
    label,
    data: { kind: 'loop-back', wrapper_id, wrapper_label: label },
  };
}

/**
 * Walk an expanded `compose`'s child subtree. Pipe/retry/loop/timeout/
 * checkpoint/map are intercepted by `walk_for_chain` before they reach
 * `walk()`, so this function only runs for compose-expanded — where the
 * children are walked via `walk_for_chain` so any wrapper grandchildren
 * still lift to peers.
 */
function walk_wrapper_child(
  ctx: WalkContext,
  parent_node: FlowNode,
  parent_graph_id: string,
): void {
  const children = parent_node.children ?? [];
  for (const child of children) {
    walk_for_chain(ctx, child, parent_graph_id, parent_graph_id);
  }
}

const MARKER_W = 44;
const MARKER_H = 44;
// (Backwards-compat aliases; the per-kind walker functions still use them
// by name so a kind can later opt into a different size if needed.)
const PIPE_MARKER_W = MARKER_W;
const PIPE_MARKER_H = MARKER_H;

function format_fn_chip(value: FlowValue | undefined): string {
  // Inline of nodes/node_helpers.format_fn_ref so the transform layer
  // doesn't import from the nodes layer (keeps the boundary clean).
  // Narrow via the `kind: '<fn>'` discriminant in FlowValue's record
  // branch — FlowValue allows record subtypes that include the fn-ref
  // shape, so we can read `kind` and `name` directly without spreads or
  // type assertions.
  if (value === null || value === undefined) return '<fn>';
  if (typeof value !== 'object') return '<fn>';
  if (Array.isArray(value)) return '<fn>';
  if (!('kind' in value) || value.kind !== '<fn>') return '<fn>';
  if (!('name' in value)) return '<fn>';
  const name = value.name;
  if (typeof name !== 'string' || name === '') return '<fn>';
  return `<fn:${name}>`;
}

function pipe_fn_edge(
  source: string,
  target: string,
  label: string,
  wrapper_id: string,
): WeftEdge {
  return {
    id: `e:pipe-fn:${source}->${target}`,
    source,
    target,
    label,
    className: 'weft-edge-pipe-fn',
    data: { kind: 'pipe-fn', wrapper_id, wrapper_label: label },
  };
}

function format_timeout_chip(config: FlowNode['config']): string {
  const ms = read_number(config?.['ms']);
  if (ms === undefined) return '⏱ timeout';
  if (ms >= 1000) {
    const seconds = ms / 1000;
    const formatted = ms % 1000 === 0 ? seconds.toFixed(0) : seconds.toFixed(1);
    return `⏱ ${formatted}s`;
  }
  return `⏱ ${String(ms)}ms`;
}

function format_checkpoint_chip(config: FlowNode['config']): string {
  const raw = config?.['key'];
  if (typeof raw === 'string') return `■ ${raw}`;
  if (raw !== null && raw !== undefined && typeof raw === 'object' && !Array.isArray(raw)
    && 'kind' in raw && raw.kind === '<fn>') {
    return '■ <fn>';
  }
  return '■ checkpoint';
}

function format_map_chip(config: FlowNode['config']): string {
  const concurrency = read_number(config?.['concurrency']);
  if (concurrency !== undefined) return `× n / ${String(concurrency)} at-once`;
  return '× n';
}

function timeout_deadline_edge(
  source: string,
  target: string,
  label: string,
  wrapper_id: string,
): WeftEdge {
  return {
    id: `e:timeout-deadline:${source}->${target}`,
    source,
    target,
    label,
    className: 'weft-edge-timeout-deadline',
    data: { kind: 'timeout-deadline', wrapper_id, wrapper_label: label },
  };
}

function checkpoint_key_edge(
  source: string,
  target: string,
  label: string,
  wrapper_id: string,
): WeftEdge {
  return {
    id: `e:checkpoint-key:${source}->${target}`,
    source,
    target,
    label,
    className: 'weft-edge-checkpoint-key',
    data: { kind: 'checkpoint-key', wrapper_id, wrapper_label: label },
  };
}

function map_cardinality_edge(
  source: string,
  target: string,
  label: string,
  wrapper_id: string,
): WeftEdge {
  return {
    id: `e:map-cardinality:${source}->${target}`,
    source,
    target,
    label,
    className: 'weft-edge-map-cardinality',
    data: { kind: 'map-cardinality', wrapper_id, wrapper_label: label },
  };
}

const JUNCTION_W = 56;
const JUNCTION_H = 56;

/**
 * Walk a branch/fallback as a small diamond junction. The two children
 * (then/otherwise or primary/backup) lift to peers; two role-tagged
 * outgoing edges fan out from the junction and carry the existing
 * solid/dashed orange styling shipped in phase C.
 *
 * Chain segment: { first: junction, last: junction } — the junction is
 * its own input and (degenerate) output. A sequence after a branch
 * connects to the junction; runtime only one branch is taken, so the
 * "successor edge" semantically picks up wherever the chosen child's
 * `last` ends up, but the v0/v1 graph model doesn't draw the
 * convergence so the junction's last is the simplest stand-in.
 */
function walk_branching_as_junction(
  ctx: WalkContext,
  node: FlowNode,
  parent_graph_id: string | null,
  graph_id: string,
  labels: ReadonlyArray<string>,
): ChainSegment {
  ctx.visited.add(node);

  // Emit junction leaf (no children at the React Flow level — children
  // are lifted to be peers below).
  const data = build_node_data(node);
  const rf_node: WeftNode = {
    id: graph_id,
    type: node.kind,
    position: { x: 0, y: 0 },
    width: JUNCTION_W,
    height: JUNCTION_H,
    data,
  };
  if (parent_graph_id !== null) rf_node.parentId = parent_graph_id;
  ctx.nodes.push(rf_node);

  // Lift children to peers; each gets its own chain segment, but the
  // junction emits a fan-out edge to each child's `first`.
  const children = node.children ?? [];
  for (let i = 0; i < children.length; i += 1) {
    const child = children[i];
    if (child === undefined) continue;
    const seg = walk_for_chain(ctx, child, parent_graph_id, graph_id);
    const label = labels[i];
    const source_handle = label === undefined ? undefined : `out:${label}`;
    ctx.edges.push(structural_edge(graph_id, seg.first, label, source_handle));
  }

  return { first: graph_id, last: graph_id };
}

/**
 * Walk parallel as a teal diamond junction with N port-keyed outgoing
 * edges (one per child). Order is preserved by ELK's FIXED_ORDER
 * constraint declared via `elk_options_for(parallel_node)` —
 * `data.kind === 'parallel'` triggers the constraint regardless of
 * whether the node was a container or a junction.
 */
function walk_parallel_as_junction(
  ctx: WalkContext,
  node: FlowNode,
  parent_graph_id: string | null,
  graph_id: string,
): ChainSegment {
  ctx.visited.add(node);

  const data = build_node_data(node);
  const rf_node: WeftNode = {
    id: graph_id,
    type: 'parallel',
    position: { x: 0, y: 0 },
    width: JUNCTION_W,
    height: JUNCTION_H,
    data,
  };
  if (parent_graph_id !== null) rf_node.parentId = parent_graph_id;
  ctx.nodes.push(rf_node);

  const children = node.children ?? [];
  const keys = read_string_array(node.config?.['keys']) ?? [];
  for (let i = 0; i < children.length; i += 1) {
    const child = children[i];
    if (child === undefined) continue;
    const seg = walk_for_chain(ctx, child, parent_graph_id, graph_id);
    const label = keys[i];
    const source_handle = label === undefined ? undefined : `out:${label}`;
    ctx.edges.push(structural_edge(graph_id, seg.first, label, source_handle));
  }

  return { first: graph_id, last: graph_id };
}

/**
 * Walk a `retry(child)` or `loop(child)` wrapper as a pure edge
 * decoration. The wrapper itself is NOT emitted as a node — only the
 * wrapped child appears in the graph. A self-loop (retry) or loop-back
 * (loop) edge attaches to the child carrying the wrapper's config
 * label. Optional sibling children (loop's guard) walk normally.
 *
 * Chain segment passes through the wrapped child unchanged: predecessor
 * lands on `child.first`, successor leaves from `child.last`. The
 * wrapper has no presence in the chain.
 */
function walk_retry_or_loop_as_edge(
  ctx: WalkContext,
  node: FlowNode,
  parent_graph_id: string | null,
  graph_id: string,
): ChainSegment {
  ctx.visited.add(node);

  const children = node.children ?? [];
  const inner = children[0];
  if (inner === undefined) {
    // Empty retry/loop: degenerate. Return a synthetic single-id segment
    // anchored at the wrapper's would-be graph id; no edge emitted.
    return { first: graph_id, last: graph_id };
  }

  // The lift: child's parentId becomes the wrapper's parent.
  const inner_segment = walk_for_chain(ctx, inner, parent_graph_id, graph_id);

  if (node.kind === 'retry') {
    const label = format_retry_label(node.config);
    ctx.edges.push(self_loop_edge(inner_segment.first, label, graph_id));
    // Retry has no guard child by spec; later children, if any, walk as
    // orphan peers without altering the chain.
    for (let i = 1; i < children.length; i += 1) {
      const sibling = children[i];
      if (sibling === undefined) continue;
      walk_for_chain(ctx, sibling, parent_graph_id, graph_id);
    }
    return inner_segment;
  }

  // loop kind: optionally has a guard child (loop body, then guard test).
  // Walk it inline so the user sees the full body→guard→continue chain
  // with a loop-back arc from guard back to body. Without this the guard
  // floated as an unconnected block — exactly the "no visible flow" the
  // user kept flagging on all_primitives.
  const label = format_loop_label(node.config);
  const guard = children[1];
  if (guard !== undefined) {
    const guard_segment = walk_for_chain(ctx, guard, parent_graph_id, graph_id);
    ctx.edges.push(structural_edge(inner_segment.last, guard_segment.first));
    ctx.edges.push(
      loop_back_edge_between(guard_segment.last, inner_segment.first, label, graph_id),
    );
    // Any additional siblings beyond the guard fall back to orphan-peer
    // behavior — the spec treats only children[0..1] as semantic.
    for (let i = 2; i < children.length; i += 1) {
      const sibling = children[i];
      if (sibling === undefined) continue;
      walk_for_chain(ctx, sibling, parent_graph_id, graph_id);
    }
    return { first: inner_segment.first, last: guard_segment.last };
  }
  ctx.edges.push(loop_back_edge(inner_segment.first, label, graph_id));
  return inner_segment;
}

/**
 * Attach a `WrapperBadge` to an already-emitted node. Mutates the node's
 * data in place. Used by wrapper-kind walkers that need to annotate the
 * lifted child with their wrapper info instead of emitting a separate
 * marker peer.
 */
function attach_wrapper_badge(
  ctx: WalkContext,
  target_id: string,
  badge: WrapperBadge,
): void {
  const target = ctx.nodes.find((n) => n.id === target_id);
  if (target === undefined) return;
  const existing = target.data.wrappers ?? [];
  target.data = { ...target.data, wrappers: [...existing, badge] };
}

/**
 * Generic helper for wrapper kinds that decorate their wrapped child:
 * `pipe` (transforms output), `timeout` (caps duration), `checkpoint`
 * (loads cached input), `map` (fans out per item).
 *
 * Earlier these emitted a separate small "marker" node adjacent to the
 * lifted child, with a decoration edge between them. The visual cost
 * was that the structural sequence chain ran through those markers — so
 * a black work step never had a line connecting directly to its
 * upstream/downstream black work step. The user flagged this exactly:
 * "lines float in space, not connecting black blocks."
 *
 * Now: walk the inner, attach a badge with the wrapper kind+config to
 * the chain endpoint (`first` for before-wrappers, `last` for
 * after-wrappers), and return the inner's chain segment unchanged. No
 * separate node, no decoration edge — just a corner badge on the work
 * step itself.
 */
function walk_wrapper_as_badge(
  ctx: WalkContext,
  node: FlowNode,
  parent_graph_id: string | null,
  graph_id: string,
  position: 'before' | 'after',
  label: string,
): ChainSegment {
  ctx.visited.add(node);

  const inner = node.children?.[0];
  if (inner === undefined) {
    // Degenerate: no child to decorate. Return a synthetic single-id
    // segment anchored at the wrapper's would-be graph id. No node is
    // emitted; the wrapper effectively disappears from the visible graph.
    return { first: graph_id, last: graph_id };
  }

  const inner_segment = walk_for_chain(ctx, inner, parent_graph_id, graph_id);
  const target_id = position === 'after' ? inner_segment.last : inner_segment.first;
  attach_wrapper_badge(ctx, target_id, { kind: node.kind, label, position });
  return inner_segment;
}

/**
 * Walk a `pipe(child, fn)` wrapper. Pipe is an after-wrapper (transforms
 * the child's output), so its badge attaches to the chain's `last`.
 * Routes through the shared `walk_wrapper_as_badge` helper so the same
 * lift-and-annotate semantics apply uniformly to pipe / timeout /
 * checkpoint / map.
 */
function walk_pipe_as_marker(
  ctx: WalkContext,
  node: FlowNode,
  parent_graph_id: string | null,
  graph_id: string,
): ChainSegment {
  return walk_wrapper_as_badge(
    ctx,
    node,
    parent_graph_id,
    graph_id,
    'after',
    format_fn_chip(node.config?.['fn']),
  );
}

/**
 * Chain-aware walk: returns a `ChainSegment` describing where the
 * predecessor's edge should land (`first`) and where the successor's
 * edge should originate (`last`). For most kinds these match
 * (single-node segment); wrappers that splice a marker around their
 * child diverge.
 *
 * Sequence/parallel/branch/fallback/scope walkers use this so wrapper
 * children can be lifted to peers transparently.
 */
function walk_for_chain(
  ctx: WalkContext,
  node: FlowNode,
  parent_graph_id: string | null,
  parent_path_str: string | null,
): ChainSegment {
  const graph_id = parent_path_str === null
    ? node.id
    : child_path(parent_path_str, node.id);

  // Cycle sentinels and previously-visited nodes always emit as-is and
  // contribute a single-id chain segment — no lifting.
  if (node.kind === CYCLE_KIND || ctx.visited.has(node)) {
    walk(ctx, node, parent_graph_id, parent_path_str);
    return { first: graph_id, last: graph_id };
  }

  // Retry / loop: drop the wrapper node entirely. The wrapped child
  // takes the wrapper's place in the chain; a self-loop (retry) or
  // loop-back (loop) edge carries the wrapper's config label and is the
  // sole visual signature. Inspector access for the wrapper config will
  // come from edge-click handling in a follow-up.
  if (node.kind === 'retry' || node.kind === 'loop') {
    return walk_retry_or_loop_as_edge(ctx, node, parent_graph_id, graph_id);
  }
  // Branch / fallback / parallel: emit as a 56px diamond junction with
  // children lifted to peers, then fan out role-tagged or port-keyed
  // edges from the junction. C-deluxe.
  if (node.kind === 'branch') {
    return walk_branching_as_junction(
      ctx,
      node,
      parent_graph_id,
      graph_id,
      ['then', 'otherwise'],
    );
  }
  if (node.kind === 'fallback') {
    return walk_branching_as_junction(
      ctx,
      node,
      parent_graph_id,
      graph_id,
      ['primary', 'backup'],
    );
  }
  if (node.kind === 'parallel') {
    return walk_parallel_as_junction(ctx, node, parent_graph_id, graph_id);
  }

  // Pipe / timeout / checkpoint / map: drop the wrapper as a separate
  // peer; instead annotate the lifted child with a corner badge so the
  // chain runs black-step → black-step directly. Pipe and timeout act
  // on output (badge sits on the chain's `last`); checkpoint and map
  // act on input (badge sits on the chain's `first`).
  if (node.kind === 'pipe') {
    return walk_wrapper_as_badge(
      ctx, node, parent_graph_id, graph_id,
      'after', format_fn_chip(node.config?.['fn']),
    );
  }
  if (node.kind === 'timeout') {
    return walk_wrapper_as_badge(
      ctx, node, parent_graph_id, graph_id,
      'after', format_timeout_chip(node.config),
    );
  }
  if (node.kind === 'checkpoint') {
    return walk_wrapper_as_badge(
      ctx, node, parent_graph_id, graph_id,
      'before', format_checkpoint_chip(node.config),
    );
  }
  if (node.kind === 'map') {
    return walk_wrapper_as_badge(
      ctx, node, parent_graph_id, graph_id,
      'before', format_map_chip(node.config),
    );
  }

  // Default: the regular walk, single-id segment.
  walk(ctx, node, parent_graph_id, parent_path_str);
  return { first: graph_id, last: graph_id };
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
    // parallel / branch / fallback are intercepted by walk_for_chain
    // before reaching walk(); their case handlers in this branch were
    // dead code post-C-deluxe and have been removed.
    if (node.kind === 'scope') {
      walk_scope_children(ctx, node, graph_id);
      return;
    }
  }

  if (node.kind === 'compose' && !ctx.expanded_composes.has(graph_id)) {
    // Collapsed compose: stop the walk here. The compose renders as a
    // single labeled block (no children, no inner edges); clicking it
    // toggles expansion via the canvas.
    return;
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

export type TreeToGraphOptions = {
  /**
   * Graph ids of `compose` nodes the caller wants expanded. Pass an empty
   * set (or omit) to render every compose collapsed — the default. A
   * compose whose graph id is in this set walks normally; absent ones
   * stop at the compose boundary.
   */
  readonly expanded_composes?: ReadonlySet<string>;
};

export function tree_to_graph(
  tree: FlowTree,
  options?: TreeToGraphOptions,
): TreeToGraphResult {
  const ctx: WalkContext = {
    nodes: [],
    edges: [],
    visited: new WeakSet(),
    expanded_composes: options?.expanded_composes ?? new Set<string>(),
  };
  // Use walk_for_chain so a root-level wrapper (e.g. a tree whose root is
  // a pipe) gets the same lift-to-peers treatment as one nested under a
  // sequence; the returned segment is unused at the root.
  walk_for_chain(ctx, tree.root, null, null);
  return { nodes: ctx.nodes, edges: ctx.edges };
}
