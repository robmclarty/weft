/**
 * Default structural edge — renders ELK's orthogonal route with rounded
 * corners. Replaces React Flow's smoothstep, which previously re-routed
 * every edge from scratch using only source/target handle positions and
 * threw away the bend points ELK actually computed (see
 * docs/layout-quality-plan.md Phase 2).
 *
 * Reads `data.waypoints` written by `apply_edge_routes`. Falls back to a
 * straight source→target line when waypoints are absent (pre-layout flash,
 * fallback layout path, or a structural mismatch).
 *
 * Path geometry lives in `edge_paths.ts` so it stays unit-testable in Node.
 */

import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react';
import type { JSX } from 'react';

import type { WeftEdge } from '../transform/tree_to_graph.js';
import { compute_orthogonal_path } from './edge_paths.js';

export function WeftOrthogonalEdge(props: EdgeProps<WeftEdge>): JSX.Element {
  const { id, sourceX, sourceY, targetX, targetY, label, markerEnd, style, data } = props;

  const elk_waypoints = data?.waypoints;
  // Use ELK's full polyline (first → bends → last) so adjacent segments
  // remain strictly orthogonal. ELK's first / last waypoint sits on the
  // node boundary at the port location it assumed; that's almost always
  // within a pixel or two of React Flow's measured handle, and the
  // orthogonal property of the path is more visually important than
  // pixel-perfect handle alignment. Fall back to the React-Flow-supplied
  // source/target when ELK didn't produce a route (pre-layout flash or
  // fallback layout path).
  const has_route = elk_waypoints !== undefined && elk_waypoints.length >= 2;
  const start = has_route
    ? { x: elk_waypoints[0]!.x, y: elk_waypoints[0]!.y }
    : { x: sourceX, y: sourceY };
  const end = has_route
    ? { x: elk_waypoints[elk_waypoints.length - 1]!.x, y: elk_waypoints[elk_waypoints.length - 1]!.y }
    : { x: targetX, y: targetY };
  const bend_points = has_route ? elk_waypoints.slice(1, -1) : [];

  const { path, midpoint } = compute_orthogonal_path(start, end, bend_points);

  const base_props = markerEnd === undefined
    ? { id, path, style }
    : { id, path, style, markerEnd };

  return (
    <>
      <BaseEdge {...base_props} />
      {typeof label === 'string' && label !== '' ? (
        <EdgeLabelRenderer>
          <div
            className="weft-edge-orth-label"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${String(midpoint.x)}px, ${String(midpoint.y)}px)`,
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
