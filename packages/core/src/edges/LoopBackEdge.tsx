/**
 * Loop-back edge — the visual signature of `loop`. Draws an arc that
 * returns from the wrapped node's right-out handle back around to its
 * left-in handle, sweeping above the node like a subway track curving
 * back to the platform. The loop config (`↺ ≤ 5`) labels the arc's apex.
 *
 * Both endpoints are real handle positions — `tree_to_graph.ts` sets
 * `sourceHandle: 'out'` and `targetHandle: 'in'` so React Flow gives us
 * distinct sourceX (right-out) and targetX (left-in) coordinates, even
 * though source and target share a graph id. The arc apex height scales
 * to the source node's measured bounds so a loop over a wide wrapper
 * doesn't get a flat line that vanishes into the chrome above.
 */

import { BaseEdge, EdgeLabelRenderer, useInternalNode, type EdgeProps } from '@xyflow/react';
import type { JSX } from 'react';

const FALLBACK_NODE_H = 60;
const MIN_ARC_H = 56;

export function LoopBackEdge(props: EdgeProps): JSX.Element {
  const { id, source, sourceX, sourceY, targetX, targetY, label, markerEnd, style } = props;
  const node = useInternalNode(source);
  const node_h = node?.measured?.height ?? FALLBACK_NODE_H;
  // Sweep above the wrapped node by at least the node's own height — that
  // clears typical wrapper container chrome (40px header band + body).
  const arc_h = Math.max(node_h * 1.0, MIN_ARC_H);
  const peak_y = Math.min(sourceY, targetY) - arc_h;

  // Cubic bezier from sourceX,sourceY (right-out) to targetX,targetY
  // (left-in) with control points pulled UP to the apex height. The
  // outboard control offsets make the curve bulge outward before
  // returning instead of cutting straight across.
  const span = Math.abs(sourceX - targetX);
  const outreach = Math.max(span * 0.4, 32);
  const mid_x = (sourceX + targetX) / 2;
  const path = `M ${String(sourceX)} ${String(sourceY)} `
    + `C ${String(sourceX + outreach)} ${String(peak_y)}, `
    + `${String(targetX - outreach)} ${String(peak_y)}, `
    + `${String(targetX)} ${String(targetY)}`;
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
            className="weft-edge-loop-back-label"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${String(mid_x)}px, ${String(peak_y - 6)}px)`,
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
