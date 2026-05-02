/**
 * Single dispatch table mapping React Flow `type` keys to edge components.
 *
 * Mirrors the constraint pattern used in `nodes/registry.ts`: this map is
 * the only place that knows which component renders which edge kind. Edge
 * components do not import each other.
 *
 * The transform tags wrapper-derived edges with kinds that React Flow then
 * dispatches via this map. Structural and overlay edges are left unset so
 * they fall through to React Flow's `defaultEdgeOptions.type` (smoothstep).
 */

import type { EdgeTypes } from '@xyflow/react';

import { LoopBackEdge } from './LoopBackEdge.js';
import { SelfLoopEdge } from './SelfLoopEdge.js';

export const edge_types: EdgeTypes = {
  'self-loop': SelfLoopEdge,
  'loop-back': LoopBackEdge,
};
