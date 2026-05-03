/**
 * Single dispatch table mapping React Flow `type` keys to edge components.
 *
 * Mirrors the constraint pattern used in `nodes/registry.ts`: this map is
 * the only place that knows which component renders which edge kind. Edge
 * components do not import each other.
 *
 * Structural / overlay / wrapper-decoration edges fall through to
 * `defaultEdgeOptions.type` (`weft-orth`) and render via
 * `WeftOrthogonalEdge`, which honors ELK's computed route. The two
 * synthetic loop edges (retry self-loops, loop back-edges) keep their own
 * components because they're geometric arcs ELK can't usefully route.
 */

import type { EdgeTypes } from '@xyflow/react';

import { LoopBackEdge } from './LoopBackEdge.js';
import { SelfLoopEdge } from './SelfLoopEdge.js';
import { WeftOrthogonalEdge } from './WeftOrthogonalEdge.js';

export const edge_types: EdgeTypes = {
  'self-loop': SelfLoopEdge,
  'loop-back': LoopBackEdge,
  'weft-orth': WeftOrthogonalEdge,
};
