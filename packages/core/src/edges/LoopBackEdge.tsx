/**
 * Loop-back edge — the visual signature of `loop`. Draws an arc that
 * returns from the wrapped node's right-out handle back around to its
 * left-in handle, sweeping above the node like a subway track curving
 * back to the platform. The loop config (`↺ ≤ 5`) labels the arc's apex.
 *
 * Path geometry lives in `edge_paths.ts` so it stays unit-testable in
 * the Node environment; this component is the thin React wrapper.
 */

import { BaseEdge, EdgeLabelRenderer, useInternalNode, type EdgeProps } from '@xyflow/react';
import type { JSX } from 'react';

import { compute_loop_back_path } from './edge_paths.js';

export function LoopBackEdge(props: EdgeProps): JSX.Element {
  const { id, source, sourceX, sourceY, targetX, targetY, label, markerEnd, style } = props;
  const node = useInternalNode(source);
  const { path, peak } = compute_loop_back_path(
    { x: sourceX, y: sourceY },
    { x: targetX, y: targetY },
    node?.measured,
  );
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
              // Center the label ON the arc's peak so it reads as a chip
              // riding the curve. The pill background (see canvas.css)
              // masks the arc stroke directly under the text; the curve
              // continues cleanly past either side of the chip. Sitting
              // the label here (instead of 6px above) lets the loop
              // container reclaim that headroom in `LOOP_TOP_PADDING`.
              transform: `translate(-50%, -50%) translate(${String(peak.x)}px, ${String(peak.y)}px)`,
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
