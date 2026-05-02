/**
 * Loop-back edge — the visual signature of `loop`. Draws a wider arc that
 * returns from the wrapped node's right-side output back around to its
 * left-side input, sweeping above the node like a subway track curving
 * back to the platform. The loop config (`↺ ≤ 5`) labels the arc's apex.
 *
 * Like SelfLoopEdge, source and target share a graph id. We synthesize
 * input-side coordinates from the source position so the arc reads as a
 * proper return loop rather than a self-arrow.
 */

import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react';
import type { JSX } from 'react';

const ARC_HEIGHT = 56;
const ARC_OUTREACH = 96;

export function LoopBackEdge(props: EdgeProps): JSX.Element {
  const { id, sourceX, sourceY, label, markerEnd, style } = props;
  // Source is the right-out handle position. Approximate the input handle
  // by mirroring across the node — assume a typical 184px leaf width plus
  // some margin so the arc clears the node body.
  const node_width = 184;
  const target_x = sourceX - node_width;
  const target_y = sourceY;
  // Peak sits above the midpoint, swept up enough to clear container chrome.
  const mid_x = (sourceX + target_x) / 2;
  const peak_y = sourceY - ARC_HEIGHT;
  const path = `M ${String(sourceX)} ${String(sourceY)} `
    + `C ${String(sourceX + ARC_OUTREACH / 2)} ${String(peak_y)}, `
    + `${String(target_x - ARC_OUTREACH / 2)} ${String(peak_y)}, `
    + `${String(target_x)} ${String(target_y)}`;
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
