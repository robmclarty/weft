/**
 * Single dispatch table mapping React Flow `type` keys to node components.
 *
 * Per constraints §3 "Dispatch-on-kind, never branch-on-kind" and taste
 * principle 4: this map is the *only* place that knows which component
 * renders which kind. Components do not import each other, do not branch on
 * other kinds, and cannot grow per-kind logic outside their own file.
 *
 * The transform tags each node with one of these `type` values; unknown
 * kinds get `'generic'` and fall through to `GenericNode` here.
 */

import type { NodeTypes } from '@xyflow/react';

import { BranchNode } from './BranchNode.js';
import { CheckpointNode } from './CheckpointNode.js';
import { ComposeNode } from './ComposeNode.js';
import { CycleNode } from './CycleNode.js';
import { EndNode } from './EndNode.js';
import { FallbackNode } from './FallbackNode.js';
import { GenericNode } from './GenericNode.js';
import { LoopNode } from './LoopNode.js';
import { MapNode } from './MapNode.js';
import { ParallelNode } from './ParallelNode.js';
import { PipeNode } from './PipeNode.js';
import { StashNode } from './StashNode.js';
import { StepNode } from './StepNode.js';
import { SuspendNode } from './SuspendNode.js';
import { TimeoutNode } from './TimeoutNode.js';
import { UseNode } from './UseNode.js';

// Several kinds intentionally absent:
//   - retry — drops the wrapper entirely; the wrapped child is visible
//     and a self-loop edge carries the retry config.
//   - sequence / scope — visual-simplification pass makes them
//     structural-only. Sequence chains its children with edges; scope
//     hosts overlay edges; neither emits a node.
// `tree_to_graph` therefore never emits nodes of those types.
export const node_types: NodeTypes = {
  step: StepNode,
  parallel: ParallelNode,
  branch: BranchNode,
  map: MapNode,
  pipe: PipeNode,
  fallback: FallbackNode,
  timeout: TimeoutNode,
  loop: LoopNode,
  compose: ComposeNode,
  checkpoint: CheckpointNode,
  suspend: SuspendNode,
  stash: StashNode,
  use: UseNode,
  cycle: CycleNode,
  end: EndNode,
  generic: GenericNode,
};
