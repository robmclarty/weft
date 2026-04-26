/**
 * Deterministic naive layered layout.
 *
 * Used when (a) `Worker` is unavailable in the host environment, or
 * (b) the ELK layout call exceeds the 10s timeout (spec.md §8 F4 / F5).
 * Produces non-overlapping positions that respect the `parentId` hierarchy.
 *
 * Coordinates are parent-relative (research F2): every child's position is
 * expressed in the parent's local frame. Pass them straight through to React
 * Flow without summing parent offsets.
 */

import type { WeftEdge, WeftNode } from '../transform/tree_to_graph.js';
import { resolve_options, type LayoutOptions } from './layout_options.js';

const DEFAULT_NODE_WIDTH = 200;
const DEFAULT_NODE_HEIGHT = 80;
const PAD_X = 24;
const PAD_Y = 48;

type Frame = { width: number; height: number };

function children_of(parent: string | null, nodes: ReadonlyArray<WeftNode>): WeftNode[] {
  const out: WeftNode[] = [];
  for (const n of nodes) {
    const key = n.parentId ?? null;
    if (key === parent) out.push(n);
  }
  return out;
}

type Layout = {
  positions: Map<string, { x: number; y: number }>;
  sizes: Map<string, Frame>;
};

function layout_children(
  parent: string | null,
  nodes: ReadonlyArray<WeftNode>,
  layout: Layout,
  direction: 'LR' | 'TB',
  node_spacing: number,
  rank_spacing: number,
): Frame {
  const direct = children_of(parent, nodes);
  if (direct.length === 0) {
    return { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT };
  }

  let inner_w = 0;
  let inner_h = 0;
  let cursor_x = parent === null ? 0 : PAD_X;
  let cursor_y = parent === null ? 0 : PAD_Y;
  const top_spacing = parent === null ? rank_spacing : node_spacing;

  for (const child of direct) {
    const child_inner = layout_children(child.id, nodes, layout, direction, node_spacing, rank_spacing);
    const w = Math.max(child.width ?? DEFAULT_NODE_WIDTH, child_inner.width);
    const h = Math.max(child.height ?? DEFAULT_NODE_HEIGHT, child_inner.height);
    layout.sizes.set(child.id, { width: w, height: h });

    layout.positions.set(child.id, { x: cursor_x, y: cursor_y });

    if (direction === 'LR') {
      cursor_x += w + top_spacing;
      if (h > inner_h) inner_h = h;
      inner_w = cursor_x - top_spacing - (parent === null ? 0 : PAD_X);
    } else {
      cursor_y += h + top_spacing;
      if (w > inner_w) inner_w = w;
      inner_h = cursor_y - top_spacing - (parent === null ? 0 : PAD_Y);
    }
  }

  if (parent === null) {
    return { width: inner_w, height: inner_h };
  }
  return {
    width: inner_w + PAD_X * 2,
    height: inner_h + PAD_Y + PAD_X,
  };
}

export function fallback_layout(
  nodes: ReadonlyArray<WeftNode>,
  edges: ReadonlyArray<WeftEdge>,
  options?: Partial<LayoutOptions>,
): { nodes: WeftNode[]; edges: WeftEdge[] } {
  const resolved = resolve_options(options);
  const layout: Layout = { positions: new Map(), sizes: new Map() };
  layout_children(
    null,
    nodes,
    layout,
    resolved.direction,
    resolved.node_spacing,
    resolved.rank_spacing,
  );

  const positioned: WeftNode[] = nodes.map((n) => {
    const pos = layout.positions.get(n.id) ?? { x: 0, y: 0 };
    const next: WeftNode = { ...n, position: pos };
    const size = layout.sizes.get(n.id);
    if (size !== undefined && n.parentId !== undefined) {
      next.width = size.width;
      next.height = size.height;
    }
    return next;
  });

  return { nodes: positioned, edges: edges.map((e) => ({ ...e })) };
}
