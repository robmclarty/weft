/**
 * Self-loop edge — the visual signature of `retry`. Draws a tight loop that
 * exits the source node's right-out handle, sweeps UP and LEFT over the
 * node body, then returns to the same handle. The retry config (`↻ 3× /
 * 250ms`) labels the apex.
 *
 * Path geometry lives in `edge_paths.ts` so it stays unit-testable in
 * the Node environment; this component is the thin React wrapper that
 * reads measured bounds from React Flow's store and renders the
 * BaseEdge plus an optional label.
 */

import { BaseEdge, EdgeLabelRenderer, useInternalNode, type EdgeProps } from '@xyflow/react';
import type { JSX } from 'react';

import { compute_self_loop_path } from './edge_paths.js';

export function SelfLoopEdge(props: EdgeProps): JSX.Element {
  const { id, source, sourceX, sourceY, label, markerEnd, style } = props;
  const node = useInternalNode(source);
  const { path, peak } = compute_self_loop_path(
    { x: sourceX, y: sourceY },
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
            className="weft-edge-self-loop-label"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${String(peak.x)}px, ${String(peak.y - 4)}px)`,
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
