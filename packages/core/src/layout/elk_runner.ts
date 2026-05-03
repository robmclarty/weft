/**
 * elkjs adapter.
 *
 * Constructs an ELK instance via `elkjs/lib/elk-api.js` plus a `workerFactory`
 * that resolves `new URL('elkjs/lib/elk-worker.min.js', import.meta.url)` (per
 * spec.md §5.2 and research F3). The bundled `elk.bundled.js` build self-spawns
 * via `Function(...)` and would require `unsafe-eval`; the api+factory pattern
 * gives bundlers a static URL they can fingerprint.
 *
 * If `Worker` is unavailable (Node test environments, sandboxed WebViews),
 * `workerFactory` is omitted so elkjs falls back to running in-thread. The
 * caller's higher-level `layout_graph` adds a deterministic naive fallback on
 * top for the case where ELK itself takes too long.
 */

import * as ElkApi from 'elkjs/lib/elk-api.js';
import type { ElkNode } from 'elkjs/lib/elk-api.js';

// elkjs is a UMD/CJS package without an `exports` field; under NodeNext the
// default-export class is surfaced through the namespace's `.default`. The
// runtime shape (UMD wrapper + Babel default) is more permissive than its
// d.ts type, so we widen to `unknown` once and narrow.
function resolve_elk_constructor(): ElkConstructorLike {
  const mod: unknown = ElkApi;
  if (typeof mod === 'function') {
    // eslint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- bridge to typed ctor
    return mod as ElkConstructorLike;
  }
  if (mod !== null && typeof mod === 'object' && 'default' in mod) {
    const candidate: unknown = (mod as { default: unknown }).default;
    if (typeof candidate === 'function') {
      // eslint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- bridge to typed ctor
      return candidate as ElkConstructorLike;
    }
  }
  throw new Error('weft.layout: elkjs default export not found at runtime');
}

const ElkCtor: ElkConstructorLike = resolve_elk_constructor();

import type { WeftEdge, WeftNode } from '../transform/tree_to_graph.js';
import type { LayoutDirection, LayoutOptions } from './layout_options.js';

export type ElkRunner = {
  readonly layout: <T extends ElkNode>(
    graph: T,
    args?: { layoutOptions?: Record<string, string> },
  ) => Promise<T>;
};

export type ElkConstructorLike = new (args?: {
  workerFactory?: (url?: string) => Worker;
  workerUrl?: string;
}) => ElkRunner;

const ELK_DIRECTION: Record<LayoutDirection, string> = {
  LR: 'RIGHT',
  TB: 'DOWN',
};

// Mirrors --weft-leaf-width / --weft-leaf-height in canvas.css.
const DEFAULT_NODE_WIDTH = 220;
const DEFAULT_NODE_HEIGHT = 60;

const PARALLEL_KIND = 'parallel';
const PARALLEL_INPUT_PORT = 'in';
const PARALLEL_OUTPUT_PORT_PREFIX = 'out:';

// Branch / fallback junctions: one input on the WEST side and two output ports
// — happy-path (`then` / `primary`) on the EAST and alt-path (`otherwise` /
// `backup`) on the SOUTH. Splitting the alt path onto a different side keeps
// ELK from routing the dashed edge as a U-turn through the diamond's right
// side and back across unrelated nodes (the visible artifact on
// all_primitives).
const BRANCH_KIND = 'branch';
const FALLBACK_KIND = 'fallback';
const JUNCTION_INPUT_PORT = 'in';
const BRANCH_HAPPY_LABEL = 'then';
const BRANCH_ALT_LABEL = 'otherwise';
const FALLBACK_HAPPY_LABEL = 'primary';
const FALLBACK_ALT_LABEL = 'backup';

function junction_port_layout(side: string): Record<string, string> {
  return { 'org.eclipse.elk.port.side': side };
}

function default_worker_factory(): ((url?: string) => Worker) | undefined {
  if (typeof Worker === 'undefined') return undefined;
  return () =>
    new Worker(
      new URL('elkjs/lib/elk-worker.min.js', import.meta.url),
      { type: 'module' },
    );
}

export function resolve_worker_factory(
  worker_factory?: ((url?: string) => Worker) | null,
): ((url?: string) => Worker) | undefined {
  if (worker_factory === null) return undefined;
  return worker_factory ?? default_worker_factory();
}

export function build_elk(
  factory: (url?: string) => Worker,
): ElkRunner {
  return new ElkCtor({ workerFactory: factory });
}

function children_of(parent: string | null, nodes: ReadonlyArray<WeftNode>): WeftNode[] {
  const out: WeftNode[] = [];
  for (const n of nodes) {
    if ((n.parentId ?? null) === parent) out.push(n);
  }
  return out;
}

function elk_options_for(node: WeftNode): Record<string, string> {
  const options: Record<string, string> = {};
  const kind = node.data?.kind ?? '';
  if (kind === PARALLEL_KIND) {
    options['org.eclipse.elk.portConstraints'] = 'FIXED_ORDER';
  } else if (kind === BRANCH_KIND || kind === FALLBACK_KIND) {
    options['org.eclipse.elk.portConstraints'] = 'FIXED_SIDE';
  }
  return options;
}

function ports_for(node: WeftNode, fan_out_targets: ReadonlyArray<string>): ElkNode['ports'] | undefined {
  const kind = node.data?.kind ?? '';
  if (kind === PARALLEL_KIND) {
    const ports: NonNullable<ElkNode['ports']> = [
      { id: `${node.id}::${PARALLEL_INPUT_PORT}` },
    ];
    for (const target of fan_out_targets) {
      ports.push({ id: `${node.id}::${PARALLEL_OUTPUT_PORT_PREFIX}${target}` });
    }
    return ports;
  }
  if (kind === BRANCH_KIND || kind === FALLBACK_KIND) {
    const happy = kind === BRANCH_KIND ? BRANCH_HAPPY_LABEL : FALLBACK_HAPPY_LABEL;
    const alt = kind === BRANCH_KIND ? BRANCH_ALT_LABEL : FALLBACK_ALT_LABEL;
    return [
      {
        id: `${node.id}::${JUNCTION_INPUT_PORT}`,
        layoutOptions: junction_port_layout('WEST'),
      },
      {
        id: `${node.id}::out:${happy}`,
        layoutOptions: junction_port_layout('EAST'),
      },
      {
        id: `${node.id}::out:${alt}`,
        layoutOptions: junction_port_layout('SOUTH'),
      },
    ];
  }
  return undefined;
}

// Header tab + body padding reserved at the top of every container chrome
// (see canvas.css `--weft-container-header-h: 32px` plus the body padding
// above the first child). ELK's child rect origin must clear this band so
// the title flag never overlaps a child. Side/bottom padding give children
// real breathing room from the bracket — 28px instead of the original 14
// keeps edges off the container boundary, which the vision-LLM kept
// flagging as "edges grazing the SCOPE container".
const CONTAINER_HEADER_BAND = 48;
const CONTAINER_PADDING = 28;
const CONTAINER_MIN_WIDTH = 280;
const CONTAINER_MIN_HEIGHT = 120;

/*
 * Wrapper-style containers. `compose` is the labeled bracket around an
 * inner subgraph; `loop` is the labeled box around body+guard+back-arc
 * with a single labeled exit. pipe/timeout/checkpoint/map became peer
 * markers, retry got dropped entirely, branch/fallback/parallel became
 * junctions.
 *
 * `loop` carries an extra geometric requirement compose doesn't: the
 * back-arc lives **outside** ELK's view but **inside** the container
 * chrome visually. The arc peaks ≈60px above the children (see
 * `compute_loop_back_path`), so the loop's own padding has to budget
 * that headroom or the arc looks cramped under the header band.
 */
const COMPOSE_KIND = 'compose';
const LOOP_KIND = 'loop';
const WRAPPER_MIN_WIDTH = 212;
const WRAPPER_MIN_HEIGHT = 114;
const WRAPPER_PADDING = 8;
// Loop-specific: budget the back-arc's wrap radius into the container's
// padding on every side so the arc stays inside the chrome instead of
// trespassing into neighboring nodes. Numbers match `LOOP_BACK_MIN_RADIUS`
// in `edges/edge_paths.ts` — both must agree for the curve to fit cleanly.
const LOOP_BACK_RADIUS = 160;
// The arc peak sits LOOP_BACK_RADIUS above the source handle, which sits
// at the leaf's vertical midline. So we only need ROUGHLY (radius -
// half_leaf) of clearance above the leaf's top edge for the curve to
// fit. Subtracting that from naive (HEADER_BAND + RADIUS) tucks the arc
// up close to the chrome's top — the buffer between header and arc peak
// shrinks from ~30px to ~6px.
const LOOP_TOP_PADDING = CONTAINER_HEADER_BAND + LOOP_BACK_RADIUS - DEFAULT_NODE_HEIGHT / 2 - 24;
const LOOP_SIDE_PADDING = LOOP_BACK_RADIUS + 16;
const LOOP_BOTTOM_PADDING = 24;
const LOOP_MIN_WIDTH = 480;
const LOOP_MIN_HEIGHT = LOOP_TOP_PADDING + DEFAULT_NODE_HEIGHT + LOOP_BOTTOM_PADDING;

type ContainerSizing = {
  readonly min_w: number;
  readonly min_h: number;
  readonly padding_top: number;
  readonly padding_side: number;
  readonly padding_bottom: number;
};

function container_sizing(kind: string): ContainerSizing {
  if (kind === LOOP_KIND) {
    return {
      min_w: LOOP_MIN_WIDTH,
      min_h: LOOP_MIN_HEIGHT,
      padding_top: LOOP_TOP_PADDING,
      padding_side: LOOP_SIDE_PADDING,
      padding_bottom: LOOP_BOTTOM_PADDING,
    };
  }
  if (kind === COMPOSE_KIND) {
    return {
      min_w: WRAPPER_MIN_WIDTH,
      min_h: WRAPPER_MIN_HEIGHT,
      padding_top: CONTAINER_HEADER_BAND,
      padding_side: WRAPPER_PADDING,
      padding_bottom: WRAPPER_PADDING,
    };
  }
  return {
    min_w: CONTAINER_MIN_WIDTH,
    min_h: CONTAINER_MIN_HEIGHT,
    padding_top: CONTAINER_HEADER_BAND,
    padding_side: CONTAINER_PADDING,
    padding_bottom: CONTAINER_PADDING,
  };
}

function build_subtree(
  parent: string | null,
  nodes: ReadonlyArray<WeftNode>,
  edges: ReadonlyArray<WeftEdge>,
  spacing: { node: number; rank: number },
): ElkNode[] {
  const direct = children_of(parent, nodes);
  const result: ElkNode[] = [];
  for (const n of direct) {
    const fan_out = (n.data?.kind ?? '') === PARALLEL_KIND
      ? edges
        .filter((e) => e.source === n.id && e.data?.kind === 'structural')
        .map((e) => e.target)
      : [];
    const sub = build_subtree(n.id, nodes, edges, spacing);
    const has_children = sub.length > 0;
    const sizing = container_sizing(n.data?.kind ?? '');
    const child: ElkNode = has_children
      ? {
          id: n.id,
          /*
           * Containers: let ELK compute the width/height from children.
           * The minimum-size constraint pins the floor so an empty
           * container still shows its header band. Spacing options are
           * forwarded explicitly because elkjs's layered algorithm runs
           * a fresh pass per nested subgraph and does NOT inherit the
           * root's spacing knobs by default — without this, leaf steps
           * inside `sequence_1` would sit only ~20px apart even when the
           * root requested 320px between layers.
           */
          layoutOptions: {
            ...elk_options_for(n),
            'org.eclipse.elk.nodeSize.constraints':
              '[NODE_LABELS, PORTS, MINIMUM_SIZE]',
            'org.eclipse.elk.nodeSize.minimum': `(${String(sizing.min_w)}, ${String(sizing.min_h)})`,
            'org.eclipse.elk.padding': `[top=${String(sizing.padding_top)},left=${String(sizing.padding_side)},bottom=${String(sizing.padding_bottom)},right=${String(sizing.padding_side)}]`,
            'org.eclipse.elk.spacing.nodeNode': String(spacing.node),
            'org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers': String(spacing.rank),
            'org.eclipse.elk.layered.spacing.edgeNodeBetweenLayers': '48',
            'org.eclipse.elk.layered.spacing.edgeEdgeBetweenLayers': '40',
          },
        }
      : {
          id: n.id,
          width: n.width ?? DEFAULT_NODE_WIDTH,
          height: n.height ?? DEFAULT_NODE_HEIGHT,
          layoutOptions: elk_options_for(n),
        };
    if (has_children) {
      child.children = sub;
    }
    const ports = ports_for(n, fan_out);
    if (ports !== undefined) child.ports = ports;
    result.push(child);
  }
  return result;
}

// Synthetic arcs that React Flow draws as custom geometry (LoopBackEdge,
// SelfLoopEdge). Sending them to ELK makes the layered algorithm see a
// cycle and pick an arbitrary order for the loop body and guard, which
// reverses them ~half the time and hides the forward edge. ELK doesn't
// route these anyway — the components compute the arc themselves — so
// excluding them gives layered cycle-breaking a clean DAG to work with.
const LAYOUT_IGNORED_EDGE_KINDS = new Set(['loop-back', 'self-loop']);

function build_elk_edges(
  edges: ReadonlyArray<WeftEdge>,
  nodes: ReadonlyArray<WeftNode>,
): NonNullable<ElkNode['edges']> {
  const by_id = new Map<string, WeftNode>();
  for (const n of nodes) by_id.set(n.id, n);
  const out: NonNullable<ElkNode['edges']> = [];
  for (const e of edges) {
    if (LAYOUT_IGNORED_EDGE_KINDS.has(e.data?.kind ?? '')) continue;
    // Branch / fallback junctions declare ports with FIXED_SIDE so the
    // happy-path edge exits east and the alt-path edge exits south. Bind
    // the edge to the specific port via `sources` so ELK actually honors
    // the side assignment — without a port-qualified source, ELK is free
    // to pick any side and we lose the routing benefit.
    const src = by_id.get(e.source);
    const src_kind = src?.data?.kind ?? '';
    const has_fixed_side = src_kind === BRANCH_KIND || src_kind === FALLBACK_KIND;
    const source_port =
      has_fixed_side && typeof e.sourceHandle === 'string'
        ? `${e.source}::${e.sourceHandle}`
        : null;
    out.push({
      id: e.id,
      sources: [source_port ?? e.source],
      targets: [e.target],
    });
  }
  return out;
}

export function build_elk_graph(
  nodes: ReadonlyArray<WeftNode>,
  edges: ReadonlyArray<WeftEdge>,
  options: LayoutOptions,
): ElkNode {
  return {
    id: '__weft_root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': ELK_DIRECTION[options.direction],
      'elk.spacing.nodeNode': String(options.node_spacing),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(options.rank_spacing),
      // Some ELK builds ignore the verbose property names above when set
      // only at the root; setting `elk.layered.spacing.baseValue` makes the
      // layered algorithm scale ALL of its internal spacings (between-
      // layers, edge-node, edge-edge) from this base. Without it, leaf
      // steps inside a sequence sit only 20px apart regardless of
      // nodeNodeBetweenLayers — exactly the "blocks too close" symptom.
      'elk.layered.spacing.baseValue': String(options.rank_spacing),
      /*
       * Orthogonal edge routing gives the subway-line read: edges run in
       * straight horizontal and vertical segments with right-angle turns
       * instead of bezier soup, so they stay legible at the new 4.5px
       * stroke weight.
       */
      'elk.edgeRouting': 'ORTHOGONAL',
      /*
       * Edge gutters. Generous values force ELK to keep every parallel
       * track on its own corridor and every label chip well away from
       * neighboring nodes. nodePlacement.bk.fixedAlignment=BALANCED keeps
       * aligned edges in straight runs rather than scattering them, which
       * helps the "follow this line from start to end" read.
       */
      'elk.spacing.edgeNode': '48',
      'elk.spacing.edgeEdge': '40',
      'elk.layered.spacing.edgeNodeBetweenLayers': '48',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '40',
      'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
      'elk.layered.crossingMinimization.semiInteractive': 'false',
      /*
       * Recurse into subflows so container nodes are sized to enclose
       * their children (and edges between siblings inside a parent are
       * routed intra-container instead of through the root).
       */
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    },
    children: build_subtree(null, nodes, edges, {
      node: options.node_spacing,
      rank: options.rank_spacing,
    }),
    edges: build_elk_edges(edges, nodes),
  };
}

type Positions = Map<string, { x: number; y: number; width?: number; height?: number }>;

function harvest_positions(node: ElkNode, into: Positions): void {
  if (node.id !== '__weft_root') {
    const pos: { x: number; y: number; width?: number; height?: number } = {
      x: node.x ?? 0,
      y: node.y ?? 0,
    };
    if (node.width !== undefined) pos.width = node.width;
    if (node.height !== undefined) pos.height = node.height;
    into.set(node.id, pos);
  }
  if (node.children !== undefined) {
    for (const child of node.children) harvest_positions(child, into);
  }
}

export function apply_positions(
  nodes: ReadonlyArray<WeftNode>,
  laid: ElkNode,
): WeftNode[] {
  const positions: Positions = new Map();
  harvest_positions(laid, positions);
  return nodes.map((n) => {
    const p = positions.get(n.id);
    if (p === undefined) return { ...n };
    const next: WeftNode = { ...n, position: { x: p.x, y: p.y } };
    // Containers (any node with descendants) must take ELK's computed bounds
    // so React Flow renders them tall/wide enough to enclose their children.
    // Leaves keep CSS-driven sizing for crisp typography.
    if (p.width !== undefined) next.width = p.width;
    if (p.height !== undefined) next.height = p.height;
    return next;
  });
}

export type EdgeWaypoint = { readonly x: number; readonly y: number };
export type EdgeRoutes = Map<string, ReadonlyArray<EdgeWaypoint>>;

type AbsPositions = Map<string, { x: number; y: number }>;

function collect_abs_positions(
  node: ElkNode,
  parent_abs: { x: number; y: number },
  into: AbsPositions,
): void {
  const node_abs = node.id === '__weft_root'
    ? { x: 0, y: 0 }
    : { x: parent_abs.x + (node.x ?? 0), y: parent_abs.y + (node.y ?? 0) };
  into.set(node.id, node_abs);
  if (node.children !== undefined) {
    for (const child of node.children) {
      collect_abs_positions(child, node_abs, into);
    }
  }
}

function harvest_edge_routes_at(
  node: ElkNode,
  parent_abs: { x: number; y: number },
  source_to_lca_offset: (edge_id: string) => { x: number; y: number } | undefined,
  into: EdgeRoutes,
): void {
  // ELK with `INCLUDE_CHILDREN` reports section coordinates in the LCA's
  // local coordinate system. The edge node it sits on (e.g. __weft_root)
  // is **not** the LCA — we have to look up the LCA per-edge and add that
  // container's absolute position. Without this shift, a sibling-to-sibling
  // edge inside a loop/use container renders far to the upper-left of the
  // canvas (its container-local origin in the ROOT frame).
  const node_abs = node.id === '__weft_root'
    ? { x: 0, y: 0 }
    : { x: parent_abs.x + (node.x ?? 0), y: parent_abs.y + (node.y ?? 0) };

  if (node.edges !== undefined) {
    for (const edge of node.edges) {
      const section = edge.sections?.[0];
      if (section === undefined) continue;
      const lca_offset = source_to_lca_offset(edge.id) ?? node_abs;
      const points: EdgeWaypoint[] = [
        { x: lca_offset.x + section.startPoint.x, y: lca_offset.y + section.startPoint.y },
      ];
      if (section.bendPoints !== undefined) {
        for (const bp of section.bendPoints) {
          points.push({ x: lca_offset.x + bp.x, y: lca_offset.y + bp.y });
        }
      }
      points.push({
        x: lca_offset.x + section.endPoint.x,
        y: lca_offset.y + section.endPoint.y,
      });
      into.set(edge.id, points);
    }
  }

  if (node.children !== undefined) {
    for (const child of node.children) {
      harvest_edge_routes_at(child, node_abs, source_to_lca_offset, into);
    }
  }
}

function collect_parent_map(
  node: ElkNode,
  parent_id: string | null,
  into: Map<string, string | null>,
): void {
  if (node.id !== '__weft_root') into.set(node.id, parent_id);
  if (node.children !== undefined) {
    const child_parent = node.id === '__weft_root' ? null : node.id;
    for (const child of node.children) {
      collect_parent_map(child, child_parent, into);
    }
  }
}

function build_lca_lookup(
  edges: ReadonlyArray<WeftEdge>,
  laid: ElkNode,
  abs_positions: AbsPositions,
): (edge_id: string) => { x: number; y: number } | undefined {
  const parent_of = new Map<string, string | null>();
  collect_parent_map(laid, null, parent_of);

  function ancestors_of(id: string): string[] {
    const out: string[] = [];
    let cur: string | null = id;
    while (cur !== null) {
      out.push(cur);
      cur = parent_of.get(cur) ?? null;
    }
    return out;
  }

  const offset_for_edge = new Map<string, { x: number; y: number }>();
  for (const e of edges) {
    const src_chain = ancestors_of(e.source);
    const tgt_set = new Set(ancestors_of(e.target));
    let lca: string | null = null;
    for (const a of src_chain) {
      if (tgt_set.has(a)) {
        lca = a;
        break;
      }
    }
    // ELK reports section coordinates in the LCA's own coordinate system
    // (origin at the LCA's top-left in flow space). Adding the LCA's
    // absolute position lifts those coords back into root flow space.
    // When source and target are top-level peers, the LCA is null and we
    // fall back to (0,0) which is correct since section coords are then
    // already in root flow space.
    if (lca === null) continue;
    const offset = abs_positions.get(lca) ?? { x: 0, y: 0 };
    offset_for_edge.set(e.id, offset);
  }
  return (edge_id) => offset_for_edge.get(edge_id);
}

export function apply_edge_routes(
  edges: ReadonlyArray<WeftEdge>,
  laid: ElkNode,
): WeftEdge[] {
  const abs_positions: AbsPositions = new Map();
  collect_abs_positions(laid, { x: 0, y: 0 }, abs_positions);
  const lca_offset = build_lca_lookup(edges, laid, abs_positions);
  const routes: EdgeRoutes = new Map();
  harvest_edge_routes_at(laid, { x: 0, y: 0 }, lca_offset, routes);
  return edges.map((e) => {
    const waypoints = routes.get(e.id);
    if (waypoints === undefined) return { ...e };
    const data = { ...(e.data ?? { kind: 'structural' as const }), waypoints };
    return { ...e, data };
  });
}
