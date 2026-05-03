/**
 * Pure path-computation helpers for the wrapper-derived edges.
 *
 * Extracted from `SelfLoopEdge` and `LoopBackEdge` so the geometry —
 * which is the load-bearing logic in those components — can be unit
 * tested in the Node environment without spinning up React Flow.
 *
 * The components themselves stay thin React wrappers around these
 * helpers + label / marker-end conditionals.
 */

const FALLBACK_NODE_W = 184;
const FALLBACK_NODE_H = 60;
const SELF_LOOP_MIN_ARC_W = 80;
const SELF_LOOP_MIN_ARC_H = 40;
const LOOP_BACK_FALLBACK_NODE_H = 60;
const LOOP_BACK_MIN_ARC_H = 56;

export type Point = { readonly x: number; readonly y: number };

export type SelfLoopGeometry = {
  readonly path: string;
  readonly peak: Point;
};

/**
 * Self-loop arc — exits the source's right-out handle, peaks above-and-
 * left over the node body, returns to the same handle. Arc dimensions
 * scale to ~85% of source width and ~90% of source height (with a
 * minimum envelope so tiny nodes still get a legible loop).
 */
export function compute_self_loop_path(
  source: Point,
  source_size?: { readonly width?: number; readonly height?: number },
): SelfLoopGeometry {
  const node_w = source_size?.width ?? FALLBACK_NODE_W;
  const node_h = source_size?.height ?? FALLBACK_NODE_H;
  const arc_w = Math.max(node_w * 0.85, SELF_LOOP_MIN_ARC_W);
  const arc_h = Math.max(node_h * 0.9, SELF_LOOP_MIN_ARC_H);
  const peak: Point = {
    x: source.x - arc_w / 2,
    y: source.y - arc_h,
  };
  const end_x = source.x - 4;
  const end_y = source.y - 6;
  const path = `M ${String(source.x)} ${String(source.y)} `
    + `C ${String(source.x + 8)} ${String(peak.y)}, `
    + `${String(peak.x)} ${String(peak.y - 4)}, `
    + `${String(end_x)} ${String(end_y)}`;
  return { path, peak };
}

export type LoopBackGeometry = {
  readonly path: string;
  readonly peak: Point;
};

/**
 * Loop-back arc — sweeps from the source's right-out to the target's
 * left-in (different handles on the same node, so React Flow gives us
 * distinct source/target coordinates). Arc clears the node's height by
 * at least the node's own height so it stays above any wrapper chrome.
 */
export function compute_loop_back_path(
  source: Point,
  target: Point,
  source_size?: { readonly height?: number },
): LoopBackGeometry {
  const node_h = source_size?.height ?? LOOP_BACK_FALLBACK_NODE_H;
  const arc_h = Math.max(node_h * 1.0, LOOP_BACK_MIN_ARC_H);
  const peak_y = Math.min(source.y, target.y) - arc_h;
  const span = Math.abs(source.x - target.x);
  const outreach = Math.max(span * 0.4, 32);
  const mid_x = (source.x + target.x) / 2;
  const path = `M ${String(source.x)} ${String(source.y)} `
    + `C ${String(source.x + outreach)} ${String(peak_y)}, `
    + `${String(target.x - outreach)} ${String(peak_y)}, `
    + `${String(target.x)} ${String(target.y)}`;
  return { path, peak: { x: mid_x, y: peak_y } };
}

const ORTHOGONAL_CORNER_RADIUS = 8;

export type OrthogonalGeometry = {
  readonly path: string;
  /** Midpoint of the polyline (by arc length), suitable for positioning a label. */
  readonly midpoint: Point;
};

function distance(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function move_toward(from: Point, toward: Point, len: number): Point {
  const total = distance(from, toward);
  if (total === 0) return { x: from.x, y: from.y };
  const t = len / total;
  return { x: from.x + (toward.x - from.x) * t, y: from.y + (toward.y - from.y) * t };
}

/**
 * Build an SVG path along an orthogonal polyline (the kind ELK emits when
 * `edgeRouting: ORTHOGONAL`), rounding interior corners with a quadratic
 * bezier whose control point is the corner itself. The corner radius is
 * clamped to half the shorter incident segment so adjacent corners don't
 * overlap on tight elbows.
 *
 * The polyline is built from `source` → `bend_points` → `target` directly.
 * Callers should pass ELK's first / last waypoint as `source` / `target`
 * (not React Flow's measured handle position) — substituting the React
 * Flow position there breaks the orthogonal property when ELK's port
 * assumption disagrees with the handle by even a pixel, which produces
 * visible diagonal stubs at the node boundary.
 */
export function compute_orthogonal_path(
  source: Point,
  target: Point,
  bend_points: ReadonlyArray<Point>,
): OrthogonalGeometry {
  const points: Point[] = [source, ...bend_points, target];
  if (points.length === 2) {
    const path = `M ${String(source.x)} ${String(source.y)} `
      + `L ${String(target.x)} ${String(target.y)}`;
    const midpoint: Point = {
      x: (source.x + target.x) / 2,
      y: (source.y + target.y) / 2,
    };
    return { path, midpoint };
  }

  let d = `M ${String(points[0]!.x)} ${String(points[0]!.y)}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    const next = points[i + 1]!;
    const r = Math.min(
      ORTHOGONAL_CORNER_RADIUS,
      distance(prev, curr) / 2,
      distance(curr, next) / 2,
    );
    if (r < 0.5) {
      d += ` L ${String(curr.x)} ${String(curr.y)}`;
      continue;
    }
    const enter = move_toward(curr, prev, r);
    const exit = move_toward(curr, next, r);
    d += ` L ${String(enter.x)} ${String(enter.y)}`;
    d += ` Q ${String(curr.x)} ${String(curr.y)} ${String(exit.x)} ${String(exit.y)}`;
  }
  const last = points[points.length - 1]!;
  d += ` L ${String(last.x)} ${String(last.y)}`;

  // Pick the longest segment and anchor the label at its midpoint. Labels
  // landing on the arc-length midpoint frequently fell on a node body when
  // the polyline straddled a node — picking the longest run avoids the
  // tightest elbows and gives "primary"/"otherwise"/"<fn:name>" chips a
  // chance to land on open canvas. Single-segment polylines land at the
  // straight midpoint either way.
  let best_mid: Point = points[0]!;
  let best_len = -Infinity;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const seg_len = distance(a, b);
    if (seg_len > best_len) {
      best_len = seg_len;
      best_mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  }
  return { path: d, midpoint: best_mid };
}
