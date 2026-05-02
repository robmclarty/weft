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
