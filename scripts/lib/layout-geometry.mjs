/**
 * Shared geometry helpers for layout-quality scoring.
 *
 * The same four metrics — crossings, bends, totalEdgeLength, nodeEdgeOverlaps
 * — are computed by `pnpm metrics` (against the live React Flow DOM) and by
 * `pnpm metrics:graphviz` (against a Graphviz `plain` output). Centralising
 * the helpers here keeps the two scorers comparable when we swap routers.
 *
 * All coordinates are expected in the same root (graph) space; the caller is
 * responsible for any axis flips or unit conversions before passing edges
 * and nodes here.
 *
 * Edge shape: `{ id, source, target, points: [[x, y], ...] }`
 * Node shape: `{ id, x, y, w, h }` (top-left origin)
 */

function ccw(ax, ay, bx, by, cx, cy) {
  return (cy - ay) * (bx - ax) - (by - ay) * (cx - ax);
}

export function segments_cross(ax, ay, bx, by, cx, cy, dx, dy) {
  // Proper intersection only — shared endpoints (the common case where two
  // edges meet at a junction node port) do not count as a crossing.
  const d1 = ccw(cx, cy, dx, dy, ax, ay);
  const d2 = ccw(cx, cy, dx, dy, bx, by);
  const d3 = ccw(ax, ay, bx, by, cx, cy);
  const d4 = ccw(ax, ay, bx, by, dx, dy);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  return false;
}

function edge_segments(edge) {
  const segs = [];
  for (let i = 0; i < edge.points.length - 1; i += 1) {
    const [ax, ay] = edge.points[i];
    const [bx, by] = edge.points[i + 1];
    segs.push({ ax, ay, bx, by, edge_id: edge.id });
  }
  return segs;
}

export function count_crossings(edges) {
  const all_segs = [];
  for (const e of edges) {
    for (const s of edge_segments(e)) all_segs.push(s);
  }
  let n = 0;
  for (let i = 0; i < all_segs.length; i += 1) {
    for (let j = i + 1; j < all_segs.length; j += 1) {
      const a = all_segs[i];
      const b = all_segs[j];
      if (a.edge_id === b.edge_id) continue;
      if (segments_cross(a.ax, a.ay, a.bx, a.by, b.ax, b.ay, b.bx, b.by)) {
        n += 1;
      }
    }
  }
  return n;
}

export function count_bends(edges) {
  let n = 0;
  for (const e of edges) {
    if (e.points.length >= 3) n += e.points.length - 2;
  }
  return n;
}

export function total_edge_length(edges) {
  let total = 0;
  for (const e of edges) {
    for (let i = 0; i < e.points.length - 1; i += 1) {
      const dx = e.points[i + 1][0] - e.points[i][0];
      const dy = e.points[i + 1][1] - e.points[i][1];
      total += Math.sqrt(dx * dx + dy * dy);
    }
  }
  return total;
}

function seg_intersects_rect(ax, ay, bx, by, rx, ry, rw, rh) {
  const x1 = rx;
  const y1 = ry;
  const x2 = rx + rw;
  const y2 = ry + rh;
  if (Math.max(ax, bx) < x1) return false;
  if (Math.min(ax, bx) > x2) return false;
  if (Math.max(ay, by) < y1) return false;
  if (Math.min(ay, by) > y2) return false;
  const inside = (px, py) => px >= x1 && px <= x2 && py >= y1 && py <= y2;
  if (inside(ax, ay) || inside(bx, by)) return true;
  if (segments_cross(ax, ay, bx, by, x1, y1, x2, y1)) return true;
  if (segments_cross(ax, ay, bx, by, x2, y1, x2, y2)) return true;
  if (segments_cross(ax, ay, bx, by, x2, y2, x1, y2)) return true;
  if (segments_cross(ax, ay, bx, by, x1, y2, x1, y1)) return true;
  return false;
}

export function count_node_edge_overlaps(nodes, edges) {
  // Containers (compose etc.) legitimately enclose their children's edges, so
  // we use a simple proxy: skip overlaps with the edge's own source/target,
  // and skip nodes that geometrically contain BOTH endpoints (presumed
  // ancestor containers).
  let n = 0;
  for (const e of edges) {
    const segs = edge_segments(e);
    if (segs.length === 0) continue;
    const start = e.points[0];
    const end = e.points[e.points.length - 1];
    for (const node of nodes) {
      if (node.id === e.source || node.id === e.target) continue;
      const startInside = start[0] >= node.x && start[0] <= node.x + node.w &&
                          start[1] >= node.y && start[1] <= node.y + node.h;
      const endInside = end[0] >= node.x && end[0] <= node.x + node.w &&
                        end[1] >= node.y && end[1] <= node.y + node.h;
      if (startInside && endInside) continue;
      for (const s of segs) {
        if (seg_intersects_rect(s.ax, s.ay, s.bx, s.by, node.x, node.y, node.w, node.h)) {
          n += 1;
          break;
        }
      }
    }
  }
  return n;
}

export function compute_metrics({ nodes, edges }) {
  return {
    nodes: nodes.length,
    edges: edges.length,
    crossings: count_crossings(edges),
    bends: count_bends(edges),
    totalEdgeLength: Math.round(total_edge_length(edges) * 10) / 10,
    nodeEdgeOverlaps: count_node_edge_overlaps(nodes, edges),
  };
}
