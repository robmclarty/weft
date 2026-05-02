/**
 * Self-loop edge — the visual signature of `retry`. Draws a tight loop that
 * exits the source node's right-out handle, sweeps UP and LEFT over the
 * node body, then returns to the same handle. The retry config (`↻ 3× /
 * 250ms`) labels the apex.
 *
 * The arc's dimensions scale to the source node's measured bounds so a
 * retry over a small leaf gets a small loop and a retry over a wider
 * wrapper container gets a proportionally larger one — fixed-px arcs
 * looked weird when the wrapped child was inside a 280px wrapper.
 *
 * The edge has the same `source` and `target` graph id by construction
 * (see `self_loop_edge` in `transform/tree_to_graph.ts`); we ignore
 * targetX/targetY (which equals sourceX/sourceY because both handles are
 * the same right-out port) and synthesize the return endpoint a few
 * pixels offset so React Flow's path SVG isn't degenerate.
 */

import { BaseEdge, EdgeLabelRenderer, useInternalNode, type EdgeProps } from '@xyflow/react';
import type { JSX } from 'react';

const FALLBACK_NODE_W = 184;
const FALLBACK_NODE_H = 60;
// Minimum arc envelope so the loop reads even when the wrapped node is tiny.
const MIN_ARC_W = 80;
const MIN_ARC_H = 40;

export function SelfLoopEdge(props: EdgeProps): JSX.Element {
  const { id, source, sourceX, sourceY, label, markerEnd, style } = props;
  const node = useInternalNode(source);
  const node_w = node?.measured?.width ?? FALLBACK_NODE_W;
  const node_h = node?.measured?.height ?? FALLBACK_NODE_H;
  // Scale the arc to ~85% of the node so it visibly hugs the wrapper
  // container chrome above the wrapped child rather than dangling off
  // into empty canvas.
  const arc_w = Math.max(node_w * 0.85, MIN_ARC_W);
  const arc_h = Math.max(node_h * 0.9, MIN_ARC_H);

  // Source = right-out handle. The arc:
  //   exits at (sourceX, sourceY)
  //   peaks at (sourceX - arc_w/2, sourceY - arc_h)   [up and left over body]
  //   returns to (sourceX - 4, sourceY - 6)            [tiny offset so the
  //                                                     SVG path isn't a
  //                                                     zero-length stub]
  const start_x = sourceX;
  const start_y = sourceY;
  const end_x = sourceX - 4;
  const end_y = sourceY - 6;
  const peak_x = sourceX - arc_w / 2;
  const peak_y = sourceY - arc_h;
  // Cubic bezier with control points pulled out left+up gives a fuller
  // loop that reads as "this node's output curves back to itself"
  // instead of the prior pinched quadratic that read as "tick mark".
  const path = `M ${String(start_x)} ${String(start_y)} `
    + `C ${String(sourceX + 8)} ${String(peak_y)}, `
    + `${String(peak_x)} ${String(peak_y - 4)}, `
    + `${String(end_x)} ${String(end_y)}`;
  // exactOptionalPropertyTypes: pass markerEnd only when defined to keep
  // BaseEdge's `string` (not `string | undefined`) prop signature happy.
  const base_props = markerEnd === undefined
    ? { id, path, style }
    : { id, path, style, markerEnd };
  return (
    <>
      <BaseEdge {...base_props} />
      {typeof label === 'string' && label !== '' ? (
        <EdgeLabelRenderer>
          <div
            className="weft-edge-self-loop-label"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${String(peak_x)}px, ${String(peak_y - 4)}px)`,
              pointerEvents: 'all',
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
