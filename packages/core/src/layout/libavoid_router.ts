/**
 * libavoid-js orthogonal router (Phase 4 spike).
 *
 * Strategy: keep ELK for node placement, but route the edges through
 * libavoid (the engine behind Inkscape/Dunnart). libavoid is purpose-built
 * for object-avoiding orthogonal routing with channel allocation and
 * parallel-edge nudging — strengths ELK's layered router doesn't share.
 *
 * Lazy-loaded. The dependency is optional (`optionalDependencies` in
 * `package.json`). If the import or WASM init fails, `route_with_libavoid`
 * resolves to `null` and the caller silently keeps ELK's routes. That keeps
 * the spike behind a flag without introducing a runtime dependency for
 * users who don't enable it.
 *
 * License caveat: libavoid-js is LGPL-2.1-or-later. Acceptable as a
 * behind-flag developer-only spike (the package is not bundled into the
 * default build) but a license review is required before flipping the
 * default `router` to `'libavoid'`.
 */

import type { WeftEdge, WeftNode } from '../transform/tree_to_graph.js';
import type { EdgeWaypoint } from './elk_runner.js';

type LibavoidPoint = { x: number; y: number };
type LibavoidPolyline = {
  size: () => number;
  get_ps: (i: number) => LibavoidPoint;
};
type LibavoidConnRef = {
  id: () => number;
  displayRoute: () => LibavoidPolyline;
  setCallback: (cb: (ptr: number) => void, ctx: unknown) => void;
};
type LibavoidShapeRef = unknown;
type LibavoidRouter = {
  processTransaction: () => void;
  setRoutingParameter?: (param: number, value: number) => void;
  setRoutingOption?: (opt: number, value: boolean) => void;
};
type LibavoidConnEnd = unknown;
type LibavoidPolygon = unknown;

type LibavoidApi = {
  OrthogonalRouting: number;
  Router: new (flags: number) => LibavoidRouter;
  Point: new (x: number, y: number) => LibavoidPoint;
  Rectangle: new (centre: LibavoidPoint, w: number, h: number) => LibavoidPolygon;
  ShapeRef: new (router: LibavoidRouter, poly: LibavoidPolygon) => LibavoidShapeRef;
  ConnEnd: new (pt: LibavoidPoint) => LibavoidConnEnd;
  ConnRef: new (
    router: LibavoidRouter,
    src: LibavoidConnEnd,
    dst: LibavoidConnEnd,
  ) => LibavoidConnRef;
};

type LibavoidLib = {
  load: () => Promise<void>;
  getInstance: () => LibavoidApi;
};

let cached_lib: LibavoidApi | null = null;
let load_attempted = false;
let load_failure_warned = false;

async function load_libavoid(): Promise<LibavoidApi | null> {
  if (cached_lib !== null) return cached_lib;
  if (load_attempted) return null;
  load_attempted = true;
  try {
    // String-literal import keeps the module name out of the static graph so
    // bundlers don't fail when the optional dep is missing. The cast widens
    // the dynamic-import return to our locally-typed shape.
    const mod: unknown = await import('libavoid-js');
    if (mod === null || typeof mod !== 'object' || !('AvoidLib' in mod)) {
      return null;
    }
    const candidate: unknown = (mod as { AvoidLib: unknown }).AvoidLib;
    if (
      candidate === null
      || typeof candidate !== 'object'
      || typeof (candidate as { load?: unknown }).load !== 'function'
      || typeof (candidate as { getInstance?: unknown }).getInstance !== 'function'
    ) {
      return null;
    }
    // eslint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- shape verified above
    const lib = candidate as LibavoidLib;
    await lib.load();
    cached_lib = lib.getInstance();
    return cached_lib;
  } catch (err) {
    if (!load_failure_warned) {
      load_failure_warned = true;
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`[weft] libavoid-js unavailable; keeping ELK routes. (${reason})`);
    }
    return null;
  }
}

function endpoint_for(
  node: WeftNode,
  origin_offset: { x: number; y: number },
): { centre: { x: number; y: number }; w: number; h: number } | null {
  const pos = node.position;
  if (pos === undefined) return null;
  const w = node.width ?? 184;
  const h = node.height ?? 60;
  return {
    centre: {
      x: origin_offset.x + pos.x + w / 2,
      y: origin_offset.y + pos.y + h / 2,
    },
    w,
    h,
  };
}

function compute_origin_offsets(nodes: ReadonlyArray<WeftNode>): Map<string, { x: number; y: number }> {
  // ELK stores child positions relative to the parent container. To pass
  // libavoid absolute screen-space rectangles, walk the parent chain and
  // accumulate offsets up to the root.
  const by_id = new Map<string, WeftNode>();
  for (const n of nodes) by_id.set(n.id, n);

  const offsets = new Map<string, { x: number; y: number }>();
  function offset_for(id: string): { x: number; y: number } {
    const cached = offsets.get(id);
    if (cached !== undefined) return cached;
    const node = by_id.get(id);
    if (node === undefined) {
      const z = { x: 0, y: 0 };
      offsets.set(id, z);
      return z;
    }
    const parent_id = node.parentId;
    if (parent_id === undefined) {
      const z = { x: 0, y: 0 };
      offsets.set(id, z);
      return z;
    }
    const parent_offset = offset_for(parent_id);
    const parent = by_id.get(parent_id);
    const parent_pos = parent?.position ?? { x: 0, y: 0 };
    const o = {
      x: parent_offset.x + parent_pos.x,
      y: parent_offset.y + parent_pos.y,
    };
    offsets.set(id, o);
    return o;
  }

  for (const n of nodes) offset_for(n.id);
  return offsets;
}

export type LibavoidRoutes = ReadonlyMap<string, ReadonlyArray<EdgeWaypoint>>;

/**
 * Route the edges with libavoid, using the node positions ELK already
 * produced as obstacles. Returns `null` if libavoid is unavailable so the
 * caller can keep the ELK routes as-is.
 */
export async function route_with_libavoid(
  positioned_nodes: ReadonlyArray<WeftNode>,
  edges: ReadonlyArray<WeftEdge>,
): Promise<LibavoidRoutes | null> {
  const Avoid = await load_libavoid();
  if (Avoid === null) return null;

  const offsets = compute_origin_offsets(positioned_nodes);
  const router = new Avoid.Router(Avoid.OrthogonalRouting);

  // Add every leaf node as an obstacle. Containers are intentionally NOT
  // added: they enclose their children and their boundaries are where
  // child-to-sibling edges must legitimately cross.
  const id_set = new Set<string>(positioned_nodes.map((n) => n.id));
  const has_children = new Set<string>();
  for (const n of positioned_nodes) {
    if (n.parentId !== undefined && id_set.has(n.parentId)) {
      has_children.add(n.parentId);
    }
  }

  // ShapeRef registers itself with the router in its constructor, so we
  // collect the references purely to keep the WASM-side handles alive for
  // the lifetime of the routing transaction. Without this hold, the JS GC
  // could free the wrappers and orphan the obstacles libavoid is using.
  const shape_handles: LibavoidShapeRef[] = [];
  for (const node of positioned_nodes) {
    if (has_children.has(node.id)) continue;
    const offset = offsets.get(node.id) ?? { x: 0, y: 0 };
    const rect = endpoint_for(node, offset);
    if (rect === null) continue;
    const centre = new Avoid.Point(rect.centre.x, rect.centre.y);
    const poly = new Avoid.Rectangle(centre, rect.w, rect.h);
    shape_handles.push(new Avoid.ShapeRef(router, poly));
  }

  // Connectors: source/target points at node centres. libavoid uses the
  // rectangle obstacles to keep routes outside the bodies.
  type Pending = {
    edge_id: string;
    conn: LibavoidConnRef;
  };
  const pending: Pending[] = [];
  const node_by_id = new Map<string, WeftNode>();
  for (const n of positioned_nodes) node_by_id.set(n.id, n);

  for (const edge of edges) {
    const src = node_by_id.get(edge.source);
    const dst = node_by_id.get(edge.target);
    if (src === undefined || dst === undefined) continue;
    const src_offset = offsets.get(src.id) ?? { x: 0, y: 0 };
    const dst_offset = offsets.get(dst.id) ?? { x: 0, y: 0 };
    const src_rect = endpoint_for(src, src_offset);
    const dst_rect = endpoint_for(dst, dst_offset);
    if (src_rect === null || dst_rect === null) continue;
    const src_pt = new Avoid.Point(src_rect.centre.x, src_rect.centre.y);
    const dst_pt = new Avoid.Point(dst_rect.centre.x, dst_rect.centre.y);
    const src_end = new Avoid.ConnEnd(src_pt);
    const dst_end = new Avoid.ConnEnd(dst_pt);
    const conn = new Avoid.ConnRef(router, src_end, dst_end);
    pending.push({ edge_id: edge.id, conn });
  }

  router.processTransaction();

  const routes = new Map<string, EdgeWaypoint[]>();
  for (const { edge_id, conn } of pending) {
    const polyline = conn.displayRoute();
    const points: EdgeWaypoint[] = [];
    const n = polyline.size();
    for (let i = 0; i < n; i += 1) {
      const p = polyline.get_ps(i);
      points.push({ x: p.x, y: p.y });
    }
    if (points.length >= 2) routes.set(edge_id, points);
  }
  // Touch the obstacle handles after processTransaction so the GC can't free
  // the wrappers mid-route (see comment where they are populated).
  void shape_handles.length;
  return routes;
}

export function apply_libavoid_routes(
  edges: ReadonlyArray<WeftEdge>,
  routes: LibavoidRoutes,
): WeftEdge[] {
  return edges.map((e) => {
    const waypoints = routes.get(e.id);
    if (waypoints === undefined) return { ...e };
    const data = { ...(e.data ?? { kind: 'structural' as const }), waypoints };
    return { ...e, data };
  });
}

/**
 * Test-only seam: clear the cached WASM instance and load-attempt latch so
 * a unit test can exercise the lazy-load failure path under a stubbed
 * dynamic import.
 */
export function reset_libavoid_for_tests(): void {
  cached_lib = null;
  load_attempted = false;
  load_failure_warned = false;
}
