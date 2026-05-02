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
const DEFAULT_NODE_WIDTH = 184;
const DEFAULT_NODE_HEIGHT = 60;

const PARALLEL_KIND = 'parallel';
const PARALLEL_INPUT_PORT = 'in';
const PARALLEL_OUTPUT_PORT_PREFIX = 'out:';

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
  if ((node.data?.kind ?? '') === PARALLEL_KIND) {
    options['org.eclipse.elk.portConstraints'] = 'FIXED_ORDER';
  }
  return options;
}

function ports_for(node: WeftNode, fan_out_targets: ReadonlyArray<string>): ElkNode['ports'] | undefined {
  if ((node.data?.kind ?? '') !== PARALLEL_KIND) return undefined;
  const ports: NonNullable<ElkNode['ports']> = [
    { id: `${node.id}::${PARALLEL_INPUT_PORT}` },
  ];
  for (const target of fan_out_targets) {
    ports.push({ id: `${node.id}::${PARALLEL_OUTPUT_PORT_PREFIX}${target}` });
  }
  return ports;
}

// Header tab + body padding reserved at the top of every container chrome
// (see canvas.css `--weft-container-header-h: 32px` plus the 8px body
// padding above the first child). ELK's child rect origin must clear this
// band so the title flag never overlaps a child. Side/bottom padding match
// the CSS container body padding (14px).
const CONTAINER_HEADER_BAND = 40;
const CONTAINER_PADDING = 14;
const CONTAINER_MIN_WIDTH = 280;
const CONTAINER_MIN_HEIGHT = 120;

function build_subtree(
  parent: string | null,
  nodes: ReadonlyArray<WeftNode>,
  edges: ReadonlyArray<WeftEdge>,
): ElkNode[] {
  const direct = children_of(parent, nodes);
  const result: ElkNode[] = [];
  for (const n of direct) {
    const fan_out = (n.data?.kind ?? '') === PARALLEL_KIND
      ? edges
        .filter((e) => e.source === n.id && e.data?.kind === 'structural')
        .map((e) => e.target)
      : [];
    const sub = build_subtree(n.id, nodes, edges);
    const has_children = sub.length > 0;
    const child: ElkNode = has_children
      ? {
          id: n.id,
          // Containers: let ELK compute the width/height from children. The
          // minimum-size constraint pins the floor so an empty container still
          // shows its header band.
          layoutOptions: {
            ...elk_options_for(n),
            'org.eclipse.elk.nodeSize.constraints':
              '[NODE_LABELS, PORTS, MINIMUM_SIZE]',
            'org.eclipse.elk.nodeSize.minimum': `(${String(CONTAINER_MIN_WIDTH)}, ${String(CONTAINER_MIN_HEIGHT)})`,
            'org.eclipse.elk.padding': `[top=${String(CONTAINER_HEADER_BAND)},left=${String(CONTAINER_PADDING)},bottom=${String(CONTAINER_PADDING)},right=${String(CONTAINER_PADDING)}]`,
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

function build_elk_edges(edges: ReadonlyArray<WeftEdge>): NonNullable<ElkNode['edges']> {
  const out: NonNullable<ElkNode['edges']> = [];
  for (const e of edges) {
    out.push({
      id: e.id,
      sources: [e.source],
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
      // Orthogonal edge routing gives the subway-line read: edges run in
      // straight horizontal and vertical segments with right-angle turns
      // instead of bezier soup, so they stay legible at the new 4.5px
      // stroke weight.
      'elk.edgeRouting': 'ORTHOGONAL',
      // Recurse into subflows so container nodes are sized to enclose their
      // children (and edges between siblings inside a parent are routed
      // intra-container instead of through the root).
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    },
    children: build_subtree(null, nodes, edges),
    edges: build_elk_edges(edges),
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
