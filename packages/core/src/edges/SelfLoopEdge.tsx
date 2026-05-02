/**
 * Self-loop edge — the visual signature of `retry`. Draws a tight loop that
 * returns from the source node's right-side output back to its right-side
 * output (a closed arc above the node), with the retry config (`↻ 3× /
 * 250ms`) labeled on the arc's apex.
 *
 * The edge has the same `source` and `target` graph id by construction (see
 * `self_loop_edge` in `transform/tree_to_graph.ts`); we ignore React Flow's
 * supplied `targetX/targetY` (which would be the same point as source) and
 * draw the loop as a fixed-shape arc above the node.
 */

import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react';
import type { JSX } from 'react';

const ARC_HEIGHT = 36;
const ARC_WIDTH = 56;

export function SelfLoopEdge(props: EdgeProps): JSX.Element {
  const { id, sourceX, sourceY, label, markerEnd, style } = props;
  // Draw an arc that exits the source going up and right, peaks above the
  // node, and re-enters the source going down. The arc is intentionally
  // small so it reads as "loops on itself" rather than a long cable.
  const start_x = sourceX;
  const start_y = sourceY;
  const end_x = sourceX - 2;
  const end_y = sourceY - 2;
  const peak_x = sourceX + ARC_WIDTH / 2;
  const peak_y = sourceY - ARC_HEIGHT;
  const path = `M ${String(start_x)} ${String(start_y)} `
    + `Q ${String(peak_x)} ${String(peak_y)} ${String(end_x)} ${String(end_y)}`;
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
