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
 * Wrapper-style containers — only expanded compose remains in the
 * post-deluxe world. pipe/timeout/checkpoint/map became peer markers,
 * retry/loop got dropped entirely, branch/fallback/parallel became
 * junctions. Compose (when expanded) is still the labeled-bracket
 * around its inner subgraph.
 */
const WRAPPER_KINDS_FOR_LAYOUT = new Set(['compose']);
const WRAPPER_MIN_WIDTH = 212;
const WRAPPER_MIN_HEIGHT = 114;
const WRAPPER_PADDING = 8;

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
    const is_wrapper = WRAPPER_KINDS_FOR_LAYOUT.has(n.data?.kind ?? '');
    const min_w = is_wrapper ? WRAPPER_MIN_WIDTH : CONTAINER_MIN_WIDTH;
    const min_h = is_wrapper ? WRAPPER_MIN_HEIGHT : CONTAINER_MIN_HEIGHT;
    const side_pad = is_wrapper ? WRAPPER_PADDING : CONTAINER_PADDING;
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
            'org.eclipse.elk.nodeSize.minimum': `(${String(min_w)}, ${String(min_h)})`,
            'org.eclipse.elk.padding': `[top=${String(CONTAINER_HEADER_BAND)},left=${String(side_pad)},bottom=${String(side_pad)},right=${String(side_pad)}]`,
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

function build_elk_edges(
  edges: ReadonlyArray<WeftEdge>,
  nodes: ReadonlyArray<WeftNode>,
): NonNullable<ElkNode['edges']> {
  const by_id = new Map<string, WeftNode>();
  for (const n of nodes) by_id.set(n.id, n);
  const out: NonNullable<ElkNode['edges']> = [];
  for (const e of edges) {
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

function harvest_edge_routes_at(
  node: ElkNode,
  parent_abs: { x: number; y: number },
  into: EdgeRoutes,
): void {
  // ELK gives child x/y relative to the parent container. Accumulate ancestor
  // offsets so the waypoints we emit are in root (flow) space — which is what
  // React Flow's custom-edge `path` expects, since edges render in the flow's
  // <g> at the same coordinate origin as the laid-out node positions.
  const node_abs = node.id === '__weft_root'
    ? { x: 0, y: 0 }
    : { x: parent_abs.x + (node.x ?? 0), y: parent_abs.y + (node.y ?? 0) };

  // ELK with `hierarchyHandling: INCLUDE_CHILDREN` may lift an edge declared at
  // root into a deeper container (the LCA of its endpoints). Walking every
  // node's `edges` is the only correct way to find them; their coordinates are
  // relative to the container they end up in.
  if (node.edges !== undefined) {
    for (const edge of node.edges) {
      const section = edge.sections?.[0];
      if (section === undefined) continue;
      const points: EdgeWaypoint[] = [
        { x: node_abs.x + section.startPoint.x, y: node_abs.y + section.startPoint.y },
      ];
      if (section.bendPoints !== undefined) {
        for (const bp of section.bendPoints) {
          points.push({ x: node_abs.x + bp.x, y: node_abs.y + bp.y });
        }
      }
      points.push({ x: node_abs.x + section.endPoint.x, y: node_abs.y + section.endPoint.y });
      into.set(edge.id, points);
    }
  }

  if (node.children !== undefined) {
    for (const child of node.children) {
      harvest_edge_routes_at(child, node_abs, into);
    }
  }
}

export function apply_edge_routes(
  edges: ReadonlyArray<WeftEdge>,
  laid: ElkNode,
): WeftEdge[] {
  const routes: EdgeRoutes = new Map();
  harvest_edge_routes_at(laid, { x: 0, y: 0 }, routes);
  return edges.map((e) => {
    const waypoints = routes.get(e.id);
    if (waypoints === undefined) return { ...e };
    const data = { ...(e.data ?? { kind: 'structural' as const }), waypoints };
    return { ...e, data };
  });
}
